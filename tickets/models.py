from django.db.models import Model, BooleanField, DateTimeField, CharField, TextField, IntegerField, DecimalField

class Ticket(Model):
  date        = DateTimeField()
  was_fair    = BooleanField()
  fine        = DecimalField(max_digits = 8, decimal_places = 2)
  location    = CharField(max_length = 500)
  description = TextField()
  lat         = DecimalField(max_digits = 9, decimal_places = 6)
  lng         = DecimalField(max_digits = 9, decimal_places = 6)
  
  def __unicode__(self):
    return u'%s - %s' % (self.location, self.date)
