"""Chủ đề 35: vùng phục vụ và số khách hàng dễ tiếp cận dịch vụ.

Mọi phép đo (buffer, diện tích) làm trên hệ toạ độ phẳng WORK_CRS, mặc định
EPSG:32648 (WGS 84 / UTM 48N), trùng hệ của bộ dữ liệu Bắc Ninh. Lớp đầu vào ở
hệ khác (vd trạm sạc SacDau lưu EPSG:4326) được reproject trước khi đo.

Các bước đều gọi thuật toán native của QGIS (is_child_algorithm=True) thay vì
duyệt từng đối tượng bằng Python, để chạy được trên lớp lớn.
"""

import processing
from qgis.core import (
    QgsExpression,
    QgsProcessing,
    QgsProcessingAlgorithm,
    QgsProcessingException,
    QgsProcessingMultiStepFeedback,
    QgsProcessingOutputNumber,
    QgsProcessingParameterCrs,
    QgsProcessingParameterExpression,
    QgsProcessingParameterFeatureSource,
    QgsProcessingParameterField,
    QgsProcessingParameterNumber,
    QgsProcessingParameterVectorDestination,
    QgsProcessingUtils,
)

TEMP = QgsProcessing.TEMPORARY_OUTPUT

# Mã PREDICATE của native:extractbylocation
INTERSECTS = 0
DISJOINT = 2


class ServiceAreaAlgorithm(QgsProcessingAlgorithm):
    UNITS = 'UNITS'
    UNIT_FILTER = 'UNIT_FILTER'
    CUSTOMERS = 'CUSTOMERS'
    WEIGHT_FIELD = 'WEIGHT_FIELD'
    RADIUS = 'RADIUS'
    WORK_CRS = 'WORK_CRS'
    STUDY_AREA = 'STUDY_AREA'

    OUTPUT_AREAS = 'OUTPUT_AREAS'
    OUTPUT_SERVED = 'OUTPUT_SERVED'
    OUTPUT_UNSERVED = 'OUTPUT_UNSERVED'
    OUTPUT_GAPS = 'OUTPUT_GAPS'

    TOTAL_CUSTOMERS = 'TOTAL_CUSTOMERS'
    SERVED_CUSTOMERS = 'SERVED_CUSTOMERS'
    SERVED_PERCENT = 'SERVED_PERCENT'
    GAP_AREA_KM2 = 'GAP_AREA_KM2'

    def name(self):
        return 'service_area'

    def displayName(self):
        return 'Vùng phục vụ và khách hàng'

    def group(self):
        return 'Phân tích'

    def groupId(self):
        return 'analysis'

    def createInstance(self):
        return ServiceAreaAlgorithm()

    def shortHelpString(self):
        return (
            '<p>Xác định vùng phục vụ quanh các đơn vị (đơn vị điện lực, trạm sạc...) '
            'và đếm số khách hàng nằm trong vùng đó.</p>'
            '<p><b>Chọn đơn vị:</b> tick "Selected features only" để chỉ dùng các đơn vị '
            'đang chọn trên bản đồ, hoặc nhập biểu thức lọc (vd <code>"ten" LIKE \'%Từ Sơn%\'</code>).</p>'
            '<p><b>Các bước:</b> lọc đơn vị → đổi sang hệ toạ độ phẳng → buffer theo bán kính → '
            'đếm khách hàng trong từng vùng (Count Points in Polygon) → tách khách hàng '
            'được/chưa được phục vụ → nếu có khu vực nghiên cứu: lấy khu vực trừ hợp các vùng '
            'phục vụ để ra vùng trống.</p>'
            '<p>Một khách hàng nằm trong nhiều vùng chồng nhau được đếm ở mỗi vùng, nhưng chỉ '
            'tính một lần trong tổng số khách hàng được phục vụ.</p>'
        )

    def initAlgorithm(self, config=None):
        self.addParameter(QgsProcessingParameterFeatureSource(
            self.UNITS, 'Lớp đơn vị phục vụ', [QgsProcessing.TypeVectorAnyGeometry]))
        self.addParameter(QgsProcessingParameterExpression(
            self.UNIT_FILTER, 'Lọc đơn vị (biểu thức, để trống = tất cả)',
            parentLayerParameterName=self.UNITS, optional=True))
        self.addParameter(QgsProcessingParameterFeatureSource(
            self.CUSTOMERS, 'Lớp khách hàng (điểm)', [QgsProcessing.TypeVectorPoint]))
        self.addParameter(QgsProcessingParameterField(
            self.WEIGHT_FIELD, 'Trường trọng số của khách hàng (vd dân số), tuỳ chọn',
            parentLayerParameterName=self.CUSTOMERS,
            type=QgsProcessingParameterField.Numeric, optional=True))
        self.addParameter(QgsProcessingParameterNumber(
            self.RADIUS, 'Bán kính phục vụ (m)',
            type=QgsProcessingParameterNumber.Double, defaultValue=3000, minValue=1))
        self.addParameter(QgsProcessingParameterCrs(
            self.WORK_CRS, 'Hệ toạ độ phẳng dùng để đo', defaultValue='EPSG:32648'))
        self.addParameter(QgsProcessingParameterFeatureSource(
            self.STUDY_AREA, 'Khu vực nghiên cứu (để tính vùng trống), tuỳ chọn',
            [QgsProcessing.TypeVectorPolygon], optional=True))

        self.addParameter(QgsProcessingParameterVectorDestination(
            self.OUTPUT_AREAS, 'Vùng phục vụ', QgsProcessing.TypeVectorPolygon))
        self.addParameter(QgsProcessingParameterVectorDestination(
            self.OUTPUT_SERVED, 'Khách hàng được phục vụ', QgsProcessing.TypeVectorPoint))
        self.addParameter(QgsProcessingParameterVectorDestination(
            self.OUTPUT_UNSERVED, 'Khách hàng chưa được phục vụ', QgsProcessing.TypeVectorPoint,
            optional=True, createByDefault=True))
        self.addParameter(QgsProcessingParameterVectorDestination(
            self.OUTPUT_GAPS, 'Vùng trống', QgsProcessing.TypeVectorPolygon,
            optional=True, createByDefault=True))

        self.addOutput(QgsProcessingOutputNumber(self.TOTAL_CUSTOMERS, 'Tổng số khách hàng'))
        self.addOutput(QgsProcessingOutputNumber(self.SERVED_CUSTOMERS, 'Số khách hàng được phục vụ'))
        self.addOutput(QgsProcessingOutputNumber(self.SERVED_PERCENT, 'Tỉ lệ được phục vụ (%)'))
        self.addOutput(QgsProcessingOutputNumber(self.GAP_AREA_KM2, 'Diện tích vùng trống (km²)'))

    def processAlgorithm(self, parameters, context, model_feedback):
        radius = self.parameterAsDouble(parameters, self.RADIUS, context)
        crs = self.parameterAsCrs(parameters, self.WORK_CRS, context)
        # Đọc chuỗi gốc: parameterAsExpression trả về '' khi biểu thức sai cú pháp,
        # bước lọc sẽ bị bỏ qua và người dùng nhận kết quả của mọi đơn vị mà không biết.
        unit_filter = self.parameterAsString(parameters, self.UNIT_FILTER, context).strip()
        weight_field = self.parameterAsString(parameters, self.WEIGHT_FIELD, context)
        has_study_area = self.parameterAsSource(parameters, self.STUDY_AREA, context) is not None

        if unit_filter:
            expr = QgsExpression(unit_filter)
            if expr.hasParserError():
                detail = expr.parserErrorString() or 'tên trường trong nháy kép, giá trị chuỗi trong nháy đơn'
                raise QgsProcessingException(f'Biểu thức lọc đơn vị sai cú pháp: {unit_filter} ({detail})')

        if not crs.isValid() or crs.isGeographic():
            raise QgsProcessingException(
                'Hệ toạ độ đo phải là hệ phẳng (đơn vị mét), vd EPSG:32648. '
                'Hệ địa lý như EPSG:4326 tính bằng độ nên buffer theo mét sẽ sai.')

        feedback = QgsProcessingMultiStepFeedback(12, model_feedback)
        step = 0

        def run(alg_id, params):
            nonlocal step
            if feedback.isCanceled():
                raise QgsProcessingException('Đã huỷ.')
            feedback.setCurrentStep(step)
            step += 1
            return processing.run(alg_id, params, context=context, feedback=feedback,
                                  is_child_algorithm=True)['OUTPUT']

        def count(layer_id):
            return QgsProcessingUtils.mapLayerFromString(layer_id, context).featureCount()

        # 1. Lọc đơn vị. "Selected features only" đi kèm parameters[UNITS] nên tự được giữ.
        units = parameters[self.UNITS]
        if unit_filter:
            units = run('native:extractbyexpression', {
                'INPUT': units, 'EXPRESSION': unit_filter, 'OUTPUT': TEMP})

        # 2. Đưa mọi lớp về hệ phẳng trước khi đo
        units = run('native:reprojectlayer', {'INPUT': units, 'TARGET_CRS': crs, 'OUTPUT': TEMP})
        unit_count = count(units)
        if unit_count == 0:
            raise QgsProcessingException('Không còn đơn vị nào sau khi lọc.')
        customers = run('native:reprojectlayer', {
            'INPUT': parameters[self.CUSTOMERS], 'TARGET_CRS': crs, 'OUTPUT': TEMP})
        total = count(customers)

        # 3. Vùng phục vụ của từng đơn vị (giữ thuộc tính đơn vị)
        buffers = run('native:buffer', {
            'INPUT': units, 'DISTANCE': radius, 'SEGMENTS': 24, 'END_CAP_STYLE': 0,
            'JOIN_STYLE': 0, 'MITER_LIMIT': 2, 'DISSOLVE': False, 'OUTPUT': TEMP})

        # 4. Đếm khách hàng trong từng vùng, cộng trọng số nếu có
        areas = run('native:countpointsinpolygon', {
            'POLYGONS': buffers, 'POINTS': customers, 'FIELD': 'so_kh', 'OUTPUT': TEMP})
        if weight_field:
            areas = run('native:countpointsinpolygon', {
                'POLYGONS': areas, 'POINTS': customers, 'WEIGHT': weight_field,
                'FIELD': 'tong_ts', 'OUTPUT': TEMP})
        areas = run('native:fieldcalculator', {
            'INPUT': areas, 'FIELD_NAME': 'ban_kinh_m', 'FIELD_TYPE': 0, 'FIELD_LENGTH': 10,
            'FIELD_PRECISION': 1, 'FORMULA': str(radius), 'OUTPUT': TEMP})
        areas = run('native:fieldcalculator', {
            'INPUT': areas, 'FIELD_NAME': 'dt_km2', 'FIELD_TYPE': 0, 'FIELD_LENGTH': 12,
            'FIELD_PRECISION': 3, 'FORMULA': 'area($geometry) / 1000000',
            'OUTPUT': parameters[self.OUTPUT_AREAS]})

        # 5. Khách hàng được / chưa được phục vụ (mỗi khách hàng tính một lần)
        served = run('native:extractbylocation', {
            'INPUT': customers, 'PREDICATE': [INTERSECTS], 'INTERSECT': buffers,
            'OUTPUT': parameters[self.OUTPUT_SERVED]})
        served_count = count(served)
        results = {
            self.OUTPUT_AREAS: areas,
            self.OUTPUT_SERVED: served,
            self.TOTAL_CUSTOMERS: total,
            self.SERVED_CUSTOMERS: served_count,
            self.SERVED_PERCENT: round(served_count * 100 / total, 2) if total else 0,
            self.GAP_AREA_KM2: None,
        }
        if parameters.get(self.OUTPUT_UNSERVED):
            results[self.OUTPUT_UNSERVED] = run('native:extractbylocation', {
                'INPUT': customers, 'PREDICATE': [DISJOINT], 'INTERSECT': buffers,
                'OUTPUT': parameters[self.OUTPUT_UNSERVED]})

        # 6. Vùng trống = khu vực nghiên cứu trừ hợp các vùng phục vụ
        if has_study_area and parameters.get(self.OUTPUT_GAPS):
            study = run('native:reprojectlayer', {
                'INPUT': parameters[self.STUDY_AREA], 'TARGET_CRS': crs, 'OUTPUT': TEMP})
            covered = run('native:dissolve', {'INPUT': buffers, 'OUTPUT': TEMP})
            gaps = run('native:difference', {'INPUT': study, 'OVERLAY': covered, 'OUTPUT': TEMP})
            gaps = run('native:fieldcalculator', {
                'INPUT': gaps, 'FIELD_NAME': 'dt_km2', 'FIELD_TYPE': 0, 'FIELD_LENGTH': 12,
                'FIELD_PRECISION': 3, 'FORMULA': 'area($geometry) / 1000000',
                'OUTPUT': parameters[self.OUTPUT_GAPS]})
            gap_layer = QgsProcessingUtils.mapLayerFromString(gaps, context)
            results[self.OUTPUT_GAPS] = gaps
            results[self.GAP_AREA_KM2] = round(sum(f['dt_km2'] or 0 for f in gap_layer.getFeatures()), 3)
        elif parameters.get(self.OUTPUT_GAPS):
            feedback.pushInfo('Không chọn khu vực nghiên cứu nên bỏ qua vùng trống.')

        feedback.pushInfo(
            f'{unit_count} đơn vị, bán kính {radius:g} m: {served_count}/{total} khách hàng '
            f'được phục vụ ({results[self.SERVED_PERCENT]}%).')
        if results[self.GAP_AREA_KM2] is not None:
            feedback.pushInfo(f'Diện tích vùng trống: {results[self.GAP_AREA_KM2]} km².')
        return results
