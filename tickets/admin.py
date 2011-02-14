from django.contrib import admin
from tickets.models import Ticket

class TicketAdmin(admin.ModelAdmin):
  list_display   = ('location', 'date', 'fine', 'was_fair', 'lat', 'lng')
  date_hierarchy = 'date'

admin.site.register(Ticket, TicketAdmin)
