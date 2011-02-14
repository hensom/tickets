import csv
from django.shortcuts  import render_to_response
from django.http       import HttpResponse
from django.template   import RequestContext
from tickets.models    import Ticket
from tickets.resources import TicketResource

def root(request):
  tr = TicketResource()
  context = {  
    "tickets_json": tr.serialize(request, [tr.full_dehydrate(ticket) for ticket in Ticket.objects.all()], 'application/json')
  };

  return render_to_response('tickets/root.html', context, RequestContext(request))
  
def download(request):
  response = HttpResponse(mimetype='text/csv')

  response['Content-Disposition'] = 'attachment; filename="NYC Bike Tickets.csv"'

  writer = csv.writer(response)
  
  writer.writerow(['Date', 'Location', 'Cost', 'Was Fair', 'Description', 'Latitude', 'Longitude'])
  
  for ticket in Ticket.objects.all().order_by('date'):
    if ticket.was_fair:
      was_fair = 'Yes'
    else:
      was_fair = 'No'

    writer.writerow([ticket.date, ticket.location, ticket.cost, was_fair, ticket.description, ticket.lat, ticket.lng])

  return response