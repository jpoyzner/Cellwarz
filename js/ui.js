define(['jquerymobile', 'underscore', 'backbone'], function() {
	return Backbone.View.extend({
		initialize: function(options) {
			this.canvas = options.canvas;
			var doc = $('body');
			
			doc.keydown(_.bind(function(event) {
				if (event.keyCode == 37 || event.keyCode == 38 || event.keyCode == 39 || event.keyCode == 40) {
					event.preventDefault();
				} else if (event.keyCode == 32 || (event.keyCode > 57 && event.keyCode < 91)) { //letters
					this.canvas.text = this.canvas.text + String.fromCharCode(event.keyCode); 
				} else if (event.keyCode == 8) { //backspace
					var input = event.srcElement || event.target;
			        if ((input.tagName.toUpperCase() === 'INPUT' && (input.type.toUpperCase() === 'TEXT' || input.type.toUpperCase() === 'PASSWORD')) 
			            || input.tagName.toUpperCase() === 'TEXTAREA') {
			            
			        	if (input.readOnly || input.disabled) {
			            	event.preventDefault();
			            }
			        } else {
			        	event.preventDefault();
			        }
					
					if (this.canvas.text.length > 0) {
						this.canvas.text = this.canvas.text.substring(0, this.canvas.text.length - 1);
					}
				} else if (event.keyCode == 13) { //enter
					if (this.canvas.text.length > 0) {
						this.canvas.syncer.connection.send(JSON.stringify({message: this.canvas.text}));
						this.canvas.text = "";
					}
				} else if (event.keyCode == 187) { //=
					console.log(this.canvas.renderer.sprites);
				}
				
				//TODO: instead of down, use keyup or keydown param
				this.canvas.syncer.connection.send(JSON.stringify({key: event.keyCode, down: true}));
			}, this))
			.keyup(_.bind(function(event) {
				//TODO: instead of down, use keyup or keydown param
				this.canvas.syncer.connection.send(JSON.stringify({key: event.keyCode, down: false}));
			}, this))
			.on("swipeleft", _.bind(function() {
				this.canvas.syncer.connection.send(JSON.stringify({key: 37, down: true}));
			}, this))
			.on("swiperight", _.bind(function() {
				this.canvas.syncer.connection.send(JSON.stringify({key: 39, down: true}));
			}, this))
			.on("tap", _.bind(function(event) {
				if (event.clientY < this.canvas.renderer.me[2] - this.canvas.renderer.offsetY) {
					this.canvas.syncer.connection.send(JSON.stringify({key: 38, down: true}));
					this.canvas.syncer.connection.send(JSON.stringify({key: 38, down: false}));
				} else {
					this.canvas.syncer.connection.send(JSON.stringify({key: 37, down: false}));
					this.canvas.syncer.connection.send(JSON.stringify({key: 39, down: false}));
				}
			}, this));
			
			//check out: http://stackoverflow.com/questions/17131815/how-to-swipe-top-down-jquery-mobile
		}
	});
});