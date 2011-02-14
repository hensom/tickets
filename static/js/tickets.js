(function() {
  if(window.TicketTrack) {
   return; 
  }

  function parseTicket(response) {
    // The API currently adds microseconds to the output, remove that before parsing
    var parts = response.date.split('.');
    response.date = Date.parse(parts[0]);
    return response
  }

  var Ticket      = Backbone.Model.extend({
    parse: function(response) {
      return parseTicket(response);
    }
  });

  var TicketList  = Backbone.Collection.extend({model: Ticket});
  var StatsView   = Backbone.View.extend({
    el:      $("#stats"),
    template: _.template($("#stats-template").html()),
    initialize: function(options) {
      this.tickets = options.tickets;
      this.start   = Date.today().addDays(-60);
      this.end     = Date.today().addDays(1);
    },
    stats: function(start, end) {
      var total  = 0,
          unfair = 0,
          fine   = 0;

      this.tickets.each(function(ticket) {
        var date = ticket.get('date');
        
        if(ticket.get('date').between(start, end)) {
          total += 1;
          fine  += ticket.get('fine');
          
          if(ticket.get('was_unfair')) unfair += 1;
        }
      });
      
      return [
        { name: "Tickets Given",        value: total  },
        { name: "Unfair Tickets Given", value: unfair },
        { name: "Average Fine",         value: ((total > 0) ? fine / total : 0).toFixed(2) },
        { name: "Total Fine",           value: fine.toFixed(2) }
      ];
    },
    render: function() {
      var context = {
        stats: this.stats(this.start, this.end)
      }
      
      $(this.el).html(this.template(context));
      
      this.renderMap();
      
      return this;
    },
    renderMap: function() {
      var self   = this;
      var mapOptions = {
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        mapTypeControl: false
      };

      var map     = new google.maps.Map($(this.el).find('.map').get(0), mapOptions);
      var markers = [];

      var latSum = 0, lngSum = 0, coordNum = 0;
      
      this.tickets.each(function(ticket) {
        if(!ticket.get('date').between(self.start, self.end)) {
          return;
        }

        latSum += ticket.get('lat');
        lngSum += ticket.get('lng');
        
        coordNum++;
        
        var pos    = new google.maps.LatLng(ticket.get('lat'), ticket.get('lng'));
        var marker = new google.maps.Marker({ map: map, position: pos });
        markers.push(marker);
      });

      var markerCluster = new MarkerClusterer(map, markers);
      
      if(coordNum > 0) {
        map.setCenter(new google.maps.LatLng(latSum / coordNum, lngSum / coordNum));
      }
      
      return this;
    }
  });
  
  var TicketView = Backbone.View.extend({
    tagName: 'li',
    template: _.template($("#ticket-template").html()),
    initialize: function(options) {
      this.ticket = options.ticket;
    },
    render: function() {
      var context = {
        'description': this.ticket.escape('description'),
        'fine':        this.ticket.get('fine'),
        'date':        this.ticket.get('date').toString("ddd, MMM d - htt"),
        'location':    this.ticket.escape('location')
      }

      $(this.el).html(this.template(context));
      
      return this;
    }
  });
  
  var TicketListView = Backbone.View.extend({
    el:     '#tickets',
    template: _.template($("#ticket-list-template").html()),
    events: {
      'click .prev': 'prevPage',
      'click .next': 'nextPage'
    },
    initialize: function(options) {
      this.tickets          = options.tickets;
      this.displayedTickets = options.displayedTickets || 4;
      this.offset           = 0;
    },
    prevPage: function() {
      if(this.offset > 0) {
        this.offset--;
        
        this.render();
      }
      return false;
    },
    nextPage: function() {
      if(this.offset < parseInt(this.tickets.length / this.displayedTickets)) {
        this.offset++;
        
        this.render();
      }
      
      return false;
    },
    render: function() {
      var context = {
        'tickets': ''
      }
      
      var initialOffset = this.offset * this.displayedTickets;
      var finalOffset   = initialOffset + this.displayedTickets;

      for(var i = initialOffset; i < finalOffset && i < this.tickets.length; i++) {
        var view = new TicketView({ticket: this.tickets.at(i)}).render();

        context.tickets += $(view.el).html();
      }
      
      $(this.el).html(this.template(context));
      
      return this;
    }
  });
    
  window.TicketTrack = Backbone.Controller.extend({
    initialize: function(options) {
      this.tickets       = new TicketList(_.map(options.tickets, function(t) { return parseTicket(t); }));
      this.statsView     = new StatsView({tickets: this.tickets});
      this.ticketsView   = new TicketListView({tickets: this.tickets});

      this.statsView.render();
      this.ticketsView.render();
    }
  });
})();
