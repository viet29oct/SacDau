def classFactory(iface):
    from .plugin import ServiceAreaPlugin
    return ServiceAreaPlugin(iface)
