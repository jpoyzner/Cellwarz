define(['backbone', 'underscore'], function() {
	return Backbone.View.extend({
		//TODO: current issue:
		//Entire cell's worth of sprite updates are sent to client, where it takes too long to draw all of them
		//the offset thing is only showing ones new offset, but might still be drawing all of them
		
		initialize: function(options) {
			this.state = "-BEGIN ANALYSIS-";
			this.connections = 0;
			this.redraws = 0;
			setInterval(_.bind(this.recordState, this), 1000);
		},
		recordState: function() {
			this.state = this.connections + " con, " + this.redraws + " draws at " + this.drawTime;
			
			this.connections = 0;
			this.redraws = 0;
		}
	});
});