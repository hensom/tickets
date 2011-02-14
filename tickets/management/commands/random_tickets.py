import random
from datetime                    import datetime, timedelta
from decimal                     import Decimal
from django.core.management.base import NoArgsCommand
from django.contrib.webdesign    import lorem_ipsum
from tickets.models              import Ticket

PLACES = [
  'Central Park',
  'East Village',
  'Prospect Park',
  'Broadway and 38th St'
]

class Command(NoArgsCommand):
  def handle_noargs(self, **options):
    Ticket.objects.all().delete()

    for i in xrange(1000):
      ticket_kwargs = {
        'location': random.choice(PLACES),
        'was_fair': random.random() > 0.25,
        'cost':     Decimal('%s' % (random.random() * 300),),
        'lat':      Decimal('%s' % (random.random() * 90),),
        'lng':      Decimal('%s' % (random.random() * 90),),
        'date':     datetime.today() - timedelta(days = int(random.random() * 30), hours = int(random.random() * 24))
      }
      
      if random.random() > 0.4:
        ticket_kwargs['description'] = lorem_ipsum.sentence()
      else:
        ticket_kwargs['description'] = lorem_ipsum.paragraph()
      
      Ticket.objects.create(**ticket_kwargs)