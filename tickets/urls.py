from django.conf               import settings
from django.conf.urls.defaults import *
from django.contrib            import admin
from tastypie.api              import Api
from tickets.resources         import TicketResource
from tickets                   import views

admin.autodiscover()

v1_api = Api(api_name='v1')
v1_api.register(TicketResource())

urlpatterns = patterns('',
  url(r'^api/',       include(v1_api.urls)),
  url(r'^admin/',     include(admin.site.urls)),
  url(r'^$',          views.root,     name = 'root'),
  url(r'^download/$', views.download, name = 'download')
)

if settings.DEBUG:
  urlpatterns += patterns('', url(r'^static/(?P<path>.*)$', 'django.views.static.serve', {'document_root': settings.STATIC_BASE}))