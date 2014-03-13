define(['underscore', 'backbone'], function(_, Backbone) {
	return Backbone.View.extend({
		initialize: function(options) {
			this.canvas = options.canvas;
			this.jump = options.jump;
	
			this.connection = new WebSocket("ws://" + document.location.host + "/Cellwarz/socketrefresh");
			
			this.connection.onopen = _.bind(function() {
				this.connection.send(JSON.stringify({connect: true, login: this.canvas.loginName, jump: this.jump}));
			}, this);
			
			this.connection.onmessage = _.bind(function(e) {
				var data = JSON.parse(e.data);	
				if (data.connect) {
					this.canvas.renderer.sprites = data.sprites;
					this.canvas.renderer.avatars = data.avatars;
					this.canvas.renderer.tools = data.tools;
					
					this.canvas.renderer.imagePaths = data.imagePaths;
					for (var i = 0; i < this.canvas.renderer.imagePaths.length; i++) {	
						var image = new Image();
						image.src = this.canvas.renderer.imagePaths[i];
						this.canvas.images[i] = image;
					}
				} else if (data.inactive) {
					//this.canvas.renderer.renderData = null;
					this.canvas.renderer.drawStaleScreen();
				} else {
					this.canvas.renderer.renderData = JSON.parse(e.data);
					this.canvas.renderer.render();
				}
			}, this);
			
			this.connection.onerror = _.bind(function(error) {
				console.log(error);
				this.connection.close();
			}, this);
		}
	});
});