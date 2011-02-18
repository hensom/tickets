$(function() {
  if(window.TicketTrack) {
   return; 
  }
  
  // Via: http://joshbohde.com/2010/11/25/backbonejs-and-django/
  // We should modify tastypie to just return the full object back after creation
  var oldSync = Backbone.sync;
  
  var escapeHTML = function(string) {
    return string.replace(/&(?!\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

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
    url:   '/api/v1/ticket/',
    parse: function(response) {
      return parseTicket(response);
    },
    toJSON: function() {
      var obj = _.clone(this.attributes);
      
      function f(n) {
          // Format integers to have at least two digits.
          return n < 10 ? '0' + n : n;
      }
      
      // Tranfer Date as they were type, not in UTC
      obj.date = obj.date.getFullYear()   + '-' +
               f(obj.date.getMonth() + 1) + '-' +
               f(obj.date.getDate())      + 'T' +
               f(obj.date.getHours())     + ':' +
               f(obj.date.getMinutes())   + ':' +
               f(obj.date.getSeconds());
      
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
    events: {
    'click .time-of-day': 'toggleChart'
    },
    initialize: function(options) {
      _.bindAll(this, 'render', 'toggleChart');

      this.tickets = options.tickets;
      this.start   = Date.today().addDays(-60);
      this.end     = Date.today().addDays(2);
      
      this.tickets.bind('add',     this.render);
      this.tickets.bind('remove',  this.render);
      this.tickets.bind('refresh', this.render);
      this.chartShown = false;
    },
    syncChartVisibility: function() {
      if(this.chartShown) {
        $("#graph").slideDown();
      } else {
        $("#graph").slideUp();
      }
    },
    toggleChart: function(e) {
      e.preventDefault();

      this.chartShown = !this.chartShown;
      this.syncChartVisibility();
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
      this.renderChart();
      
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
      var bounds  = new google.maps.LatLngBounds();
      
      this.tickets.each(function(ticket) {
        if(!ticket.get('date').between(self.start, self.end)) {
          return;
        }
        
        var pos    = new google.maps.LatLng(ticket.get('lat'), ticket.get('lng'));
        var marker = new google.maps.Marker({ map: map, position: pos });
        
        google.maps.event.addListener(marker, "click", function() {
          self.trigger('ticket:clicked', ticket);
        });
        markers.push(marker);
        bounds.extend(pos);
      });

      var markerCluster = new MarkerClusterer(map, markers);

      map.fitBounds(bounds);

      this.syncChartVisibility();
      
      return this;
    },
    renderChart: function() {
      var days        = [0, 1, 2, 3, 4, 5, 6];
      var dayNames    = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      var periods     = [ [0, 4],  [5, 8],   [9, 12],    [13, 16],   [17, 20],    [21, 23] ];
      var periodNames = ["12am-5", "5am-9", "9am-noon", "noon-5pm", "5pm-8pm", "9pm-midnight"];
      var summary      = { };
      
      var xs = [ ], ys = [ ], data = [ ], lookup = { };
      var i  = 0;
      
      _.each(days, function(day, di) { _.each(periods, function(period, pi) {
          xs.push(pi); ys.push(di); data.push(0);
          
          var key     = [di, pi].join('-');
          lookup[key] = i++;
      }); });
      
      this.tickets.each(function(ticket) {
        var day    = ticket.get('date').getDay();
        var hour   = ticket.get('date').getHours();
        var period = null;
        
        for(var i = 0 ; i < periods.length; i++) {
          var min = periods[i][0], max = periods[i][1];
          
          if(hour >= min && hour <= max) {
            period = i;
            break;
          }
        }
        
        var key = [day, period].join('-');
        data[lookup[key]]++;
      });

      var options = {symbol: "o", max: 10, heat: true, axis: "0 0 1 1", axisxstep: 5, axisystep: 6, axisxlabels: periodNames, axisxtype: " ", axisytype: " ", axisylabels: dayNames}
      var r       = Raphael("graph");

      r.g.txtattr.font = "11px 'Fontin Sans', Fontin-Sans, sans-serif";
      r.g.dotchart(0, 0, 600, 240, xs, ys, data, options).hover(function () {
        this.tag = this.tag || r.g.tag(this.x, this.y, this.value, 0, this.r + 2).insertBefore(this);
        this.tag.show();
      }, function () {
        this.tag && this.tag.hide();
      });
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
        'description': this.ticket.escape('description').split("\n").join("<br />"),
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
      'keyup input,textarea':       'harvestForm',
      'click input[type=checkbox]': 'harvestForm',
      'click input.save':           'saveTicket',
      'keyup input[name=location]': 'centerMap'
    },
    initialize: function(options) {
      _.bindAll(this, 'doCenterMap');

      if(options.ticket) {
        this.ticket = options.ticket;
      } else {
        this.ticket = new Ticket({
          'date':        new Date(),
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
        this.ticket.save(null, {
          success: function(model, response) {
            self.trigger('ticket:created', model);
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
      data.was_fair = $(this.el).find('form input[name=was_fair]').get(0).checked;

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
      'click .do-search': 'filterTickets',
      'keyup .search':    'maybeFilterTickets'
    },
    initialize: function(options) {
      _.bindAll(this, 'render', 'filterTickets', 'nextPage', 'prevPage', 'toggleNewTicket');

      this.allTickets       = options.tickets;
      this.matchingTickets  = new TicketList(options.tickets.models);
      this.newTicketView    = options.newTicketView;
      this.displayedTickets = options.displayedTickets || 10;
      this.offset           = 0;
      this.search           = ''
      
      this.allTickets.bind('add',     this.filterTickets);
      this.allTickets.bind('remove',  this.filterTickets);
      this.allTickets.bind('refresh', this.filterTickets);
      this.matchingTickets.bind('add',     this.render);
      this.matchingTickets.bind('remove',  this.render);
      this.matchingTickets.bind('refresh', this.render);
    },
    setSearch: function(search) {
      $(this.el).find('.search').val(search);
      this.filterTickets();
    },
    maybeFilterTickets: function(e) {
      if(e.keyCode == 13) {
        this.filterTickets();
      }
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
        'search': escapeHTML(this.search),
        'tickets': '',
        'message': ''
      }
      
      var initialOffset = this.offset * this.displayedTickets;
      var finalOffset   = initialOffset + this.displayedTickets;

      for(var i = initialOffset; i < finalOffset && i < this.matchingTickets.length; i++) {
        var view = new TicketView({ticket: this.matchingTickets.at(i)}).render();

        context.tickets += $(view.el).html();
      }
      
      if(!context.tickets) {
        context.message = 'No tickets have been added.';
      }
      
      $(this.el).html(this.template(context));
      try {
        $(this.el).find("#ticket-list").masonry({ singleMode: true, animate: true });
      } catch(e) { }
      
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
      
      this.newTicketView.hide();
      
      var self = this;
      this.newTicketView.bind('ticket:created', function(ticket) {
        self.tickets.refresh([ticket].concat(self.tickets.models));
        self.newTicketView.hide();
      });
      this.statsView.bind("ticket:clicked", function(ticket) {
        self.ticketsView.setSearch(ticket.get('location'));
      });
    }
  });
});
