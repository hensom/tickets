(function() {
  if(window.TicketTrack) {
   return; 
  }
  
  // Via: http://joshbohde.com/2010/11/25/backbonejs-and-django/
  // We should modify tastypie to just return the full object back after creation
  var oldSync = Backbone.sync;

  Backbone.sync = function(method, model, success, error) {
      var newSuccess = function(resp, status, xhr){
          if(xhr.statusText === "CREATED"){
              var location = xhr.getResponseHeader('Location');
              return $.ajax({
                         url: location,
                         success: success
                     });
          }
          return success(resp);
      };
      return oldSync(method, model, newSuccess, error);
  };

  function parseTicket(response) {
    // The API currently adds microseconds to the output, remove that before parsing
    var parts = response.date.split('.');
    response.date = Date.parse(parts[0]);
    return response
  }

  var Ticket      = Backbone.Model.extend({
    url:   'api/v1/ticket/',
    parse: function(response) {
      return parseTicket(response);
    },
    toJSON: function() {
      var obj = _.clone(this.attributes);
      
      // Force all decimals to strings until we patch tastypie
      _.each(['lat', 'lng', 'fine'], function(prop) {
        obj[prop] = '' + obj[prop];        
      });

      return obj;
    }
  });

  var TicketList  = Backbone.Collection.extend({model: Ticket});
  var StatsView   = Backbone.View.extend({
    el:      $("#stats"),
    template: _.template($("#stats-template").html()),
    initialize: function(options) {
      _.bindAll(this, 'render');

      this.tickets = options.tickets;
      this.start   = Date.today().addDays(-60);
      this.end     = Date.today().addDays(2);
      
      this.tickets.bind('add',    this.render);
      this.tickets.bind('remove', this.render);
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
          
          if(!ticket.get('was_fair')) unfair += 1;
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
      _.bindAll(this, "render");

      this.ticket = options.ticket;
      
      this.ticket.bind('change', this.render);
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
  
  var NewTicketView = Backbone.View.extend({
    el: "#new-ticket",
    template: _.template($("#new-ticket-template").html()),
    events: {
      'keyup input,textarea': 'harvestForm',
      'click input,textarea': 'harvestForm',
      'click input.save':     'saveTicket',
      'click input[name=was_fair]' : 'syncFairText',
      'keyup input[name=location]':  'centerMap'
    },
    initialize: function(options) {
      _.bindAll(this, "harvestForm", "saveCoords", "saveTicket", "doCenterMap");

      if(options.ticket) {
        this.ticket = options.ticket;
      } else {
        this.ticket = new Ticket({
          'date':        Date.now(),
          'fine':        '270',
          'was_fair':     true,
          'location':    'Central Park',
          'description': 'Tell us what happened',
          'lat':          40.7788516,
          'lng':         -73.9678574
        });
        this._shown = true;
        this._marker_moved = false;
        this._pending_map_update = null;
      }
    },
    syncFairText: function() {
      var was_fair = $(this.el).find('input[name=was_fair]').first();
      var desc     = $(this.el).find('.fair-text');

      desc.text( (was_fair.get(0).checked) ? "It was fair" : "It was bogus" );
    },
    shown: function() {
      return this._shown;
    },
    show: function() {
      $(this.el).slideDown();
      this._shown = true;
    },
    hide: function() {
      $(this.el).slideUp();
      this._shown = false;
    },
    saveTicket: function() {
      this.harvestForm();
      
      if(this.valid) {
        var self = this;
        this.ticket.save({}, {
          success: function(model, response) {
            self.trigger('newTicket', model);
            self.ticket = self.ticket.clone();
            self._marker_moved = false;
            self.ticket.set({id: null});
          },
          error:   function(model, response) {
            alert('Sorry, but there was a problem saving your ticket. Please try again');
            console.log('unable to save', model, response);
          }
        });
      }
    },
    harvestForm: function() {
      var data    = { };
      var trans   = {
        'date': function(v) { return Date.parse(v); },
        'fine': function(v) { return parseFloat(v); },
        'lat':  function(v) { return parseFloat(v); },
        'lng':  function(v) { return parseFloat(v); }
      }
      
      this.valid = true;      
      var self = this;

      _.each($(this.el).find('form').serializeArray(), function(item) {
        var value = (item.name in trans) ? trans[item.name](item.value) : item.value;
        var nameMatch = '[name=' + item.name + ']';
        var inp   = $(self.el).find('input' + nameMatch + ',textarea' + nameMatch);
        
        if(_.isString(value)) value = $.trim(value);
        
        if(value == null || value == '' || _.isNaN(value)) {
          self.valid = false;
          inp.addClass('invalid');
        } else {
          data[item.name] = value;
          inp.removeClass('invalid');
        }
      });

      this.ticket.set(data);
    },
    render: function() {
      var context = {
        'date':        this.ticket.get('date').toString('ddd, MMM d, htt'),
        'fine':        this.ticket.escape('fine'),
        'location':    this.ticket.escape('location'),
        'description': this.ticket.escape('description'),
        'was_fair':    this.ticket.get('was_fair'),
        'lat':         this.ticket.get('lat'),
        'lng':         this.ticket.get('lng')
      };
      
      $(this.el).html(this.template(context));
      
      var ticketView = new TicketView({ticket: this.ticket, el: $(this.el).find('.preview').get(0)});
      
      ticketView.render();
      
      this.renderMap();
      this.syncFairText();

      return this;
    },
    renderMap: function() {
      var mapOptions = {
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        mapTypeControl: false
      };

      var map    = new google.maps.Map($(this.el).find('.map').get(0), mapOptions);
      var pos    = new google.maps.LatLng(this.ticket.get('lat'), this.ticket.get('lng'));
      var marker = new google.maps.Marker({ map: map, position: pos, draggable: true });
      
      google.maps.event.addListener(marker, "dragend", this.saveCoords);

      map.setCenter(pos);
      
      this.map    = map;
      this.marker = marker;
    },
    saveCoords: function(e) {
      // Responding to a dragend if this is defined
      if(e) this._marker_moved = true; 

      var pos = this.marker.getPosition();

      $(this.el).find('input[name="lat"]').val(pos.lat());
      $(this.el).find('input[name="lng"]').val(pos.lng());

      this.harvestForm();
    },
    doCenterMap: function() {
      var loc      = $(this.el).find('input[name=location]').val();
      var geocoder = new google.maps.Geocoder();
      var map      = this.map;
      var marker   = this.marker;
      var self     = this;

      if(this._pending_map_update) {
        clearTimeout(this._pending_map_update);
        this._pending_map_update = null;
      }

      var query = {
        address: loc,
        bounds:  new google.maps.LatLngBounds(
          new google.maps.LatLng(41.185095,-78.315833),
          new google.maps.LatLng(45.342717,-70.120032)
        )
      };

      geocoder.geocode(query, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          map.setCenter(results[0].geometry.location);
          marker.setPosition(results[0].geometry.location);

          self.saveCoords();
        } else {
        }
      });
    },
    centerMap: function(e) {
      var loc = $(this.el).find('input[name=location]').val();

      if(this._marker_moved && loc.length < 3 || this._pending_map_update || this._marker_moved) {
        return;
      }

      this._pending_map_update = setTimeout(this.doCenterMap, 1000);
    }
  })
  
  var TicketListView = Backbone.View.extend({
    el:     '#tickets',
    template: _.template($("#ticket-list-template").html()),
    events: {
      'click .prev':   'prevPage',
      'click .next':   'nextPage',
      'click .add':    'toggleNewTicket',
      'click .do-search': 'filterTickets'
    },
    initialize: function(options) {
      _.bindAll(this, 'render', 'filterTickets', 'nextPage', 'prevPage');

      this.allTickets       = options.tickets;
      this.matchingTickets  = new TicketList(options.tickets.models);
      this.newTicketView    = options.newTicketView;
      this.displayedTickets = options.displayedTickets || 10;
      this.offset           = 0;
      this.search           = ''
      
      this.allTickets.bind('add',    this.filterTickets);
      this.allTickets.bind('remove', this.filterTickets);
      this.matchingTickets.bind('refresh', this.render);
    },
    filterTickets: function() {
      this.search = $(this.el).find('.search').val();

      var filters = this.search.toLowerCase().split(/\s+/);
      
      var matching = this.allTickets.filter(function(ticket) {
        var match_txt = ticket.get('location').toLowerCase() + ticket.get('description').toLowerCase();
        
        return _.all(filters, function(f) { return match_txt.indexOf(f) != -1; })
      });
      
      this.offset = 0;
      this.matchingTickets.refresh(matching);

      return false;
    },
    toggleNewTicket: function() {
      if(this.newTicketView.shown()) {
        this.newTicketView.hide();
      } else {
        this.newTicketView.show();
        $.scrollTo(this.newTicketView.el, { duration: 500, offset: -30 });
      }
      return false;
    },
    prevPage: function(e) {
      if(e) e.preventDefault();

      if(this.offset > 0) {
        this.offset--;
        
        this.render();
        this.toTop();
      }
      return false;
    },
    nextPage: function(e) {
      if(e) e.preventDefault();

      if(this.offset < parseInt(this.matchingTickets.length / this.displayedTickets)) {
        this.offset++;
        
        this.render();
        this.toTop();
      }
      
      return false;
    },
    toTop: function() {
      $.scrollTo(this.el, { duration: 500, offset: -30 });
    },
    render: function() {
      var context = {
        'search': escape(this.search),
        'tickets': ''
      }
      
      var initialOffset = this.offset * this.displayedTickets;
      var finalOffset   = initialOffset + this.displayedTickets;

      for(var i = initialOffset; i < finalOffset && i < this.matchingTickets.length; i++) {
        var view = new TicketView({ticket: this.matchingTickets.at(i)}).render();

        context.tickets += $(view.el).html();
      }
      
      $(this.el).html(this.template(context));
      $(this.el).find("#ticket-list").masonry({ singleMode: true, animate: true });
      
      return this;
    }
  });
    
  window.TicketTrack = Backbone.Controller.extend({
    initialize: function(options) {
      this.tickets       = new TicketList(_.map(options.tickets, function(t) { return parseTicket(t); }));
      this.newTicketView = new NewTicketView({});
      this.statsView     = new StatsView({tickets: this.tickets});
      this.ticketsView   = new TicketListView({tickets: this.tickets, newTicketView: this.newTicketView});

      this.statsView.render();
      this.ticketsView.render();
      this.newTicketView.render();
      
//      this.newTicketView.hide();
      
      var self = this;
      this.newTicketView.bind('newTicket', function(ticket) {
        self.tickets.add(ticket);
        self.newTicketView.hide();
      });
    }
  });
})();
