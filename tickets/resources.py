from tastypie.resources import ModelResource
from tickets.models     import Ticket

class TicketResource(ModelResource):
  class Meta:
    queryset = Ticket.objects.all()
    fields   = ['id', 'date', 'location', 'lat', 'lng', 'was_fair', 'fine', 'description']
