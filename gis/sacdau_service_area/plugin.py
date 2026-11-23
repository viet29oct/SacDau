from pathlib import Path

from qgis.core import QgsApplication
from qgis.PyQt.QtGui import QIcon
from qgis.PyQt.QtWidgets import QAction

from .provider import ServiceAreaProvider

ICON_PATH = str(Path(__file__).parent / 'icon.svg')
MENU = '&SacDau'


class ServiceAreaPlugin:
    def __init__(self, iface):
        self.iface = iface
        self.provider = None
        self.action = None

    # QGIS gọi hàm này riêng khi chạy không có giao diện (qgis_process),
    # nên đăng ký provider ở đây chứ không để trong initGui.
    def initProcessing(self):
        self.provider = ServiceAreaProvider()
        QgsApplication.processingRegistry().addProvider(self.provider)

    def initGui(self):
        self.initProcessing()
        self.action = QAction(QIcon(ICON_PATH), 'Vùng phục vụ và khách hàng', self.iface.mainWindow())
        self.action.triggered.connect(self.run)
        self.iface.addPluginToMenu(MENU, self.action)
        self.iface.addToolBarIcon(self.action)

    def unload(self):
        if self.action:
            self.iface.removePluginMenu(MENU, self.action)
            self.iface.removeToolBarIcon(self.action)
            self.action = None
        if self.provider:
            QgsApplication.processingRegistry().removeProvider(self.provider)
            self.provider = None

    def run(self):
        import processing
        processing.execAlgorithmDialog('sacdau:service_area')
