from pathlib import Path

from qgis.core import QgsProcessingProvider
from qgis.PyQt.QtGui import QIcon

from .algorithms.service_area import ServiceAreaAlgorithm


class ServiceAreaProvider(QgsProcessingProvider):
    def loadAlgorithms(self):
        self.addAlgorithm(ServiceAreaAlgorithm())

    def id(self):
        return 'sacdau'

    def name(self):
        return 'SacDau'

    def longName(self):
        return 'SacDau - phân tích vùng phục vụ'

    def icon(self):
        return QIcon(str(Path(__file__).parent / 'icon.svg'))
