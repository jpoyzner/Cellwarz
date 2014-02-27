define(['underscore', 'backbone'], function(_, Backbone) {
	return Backbone.View.extend({
		initialize: function(options) {
			this.canvas = options.canvas;
			
			$(document).keydown(_.bind(function(event) {
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
				}
				
				//TODO: instead of down, use keyup or keydown param
				this.canvas.syncer.connection.send(JSON.stringify({key: event.keyCode, down: true}));
			}, this));
			
			$(document).keyup(_.bind(function(event) {
				//TODO: instead of down, use keyup or keydown param
				this.canvas.syncer.connection.send(JSON.stringify({key: event.keyCode, down: false}));
			}, this));
		}
	});
});