define(['backbone', 'ui', 'renderer', 'syncer'], function(Backbone, UI, Renderer, Syncer) {
	return Backbone.View.extend({
		initialize: function(options) {
			this.loginName = $('#loginName').val();
			if (this.loginName.length != 0) {
				$('#login').remove();
				
				this.canvas = $('#canvas').get(0);
				this.ctx = this.canvas.getContext('2d');
				this.ctx.globalAlpha = 1;

				//TODO: these are legacy but can be still used for debugging:
				//var engineFramesPerSecond = 48;
				//refreshRate = 1000 / engineFramesPerSecond;
				//inactivityTimeout = 3000;
				//timedOut = false;
				//timedOutCount = 0;
				//totalReqCount = 0;
				//needsRefresh = false;
				
				this.images = new Array();
				this.text = "";

				this.ui = new UI({canvas: this});
				this.renderer = new Renderer({canvas: this});
				this.syncer = new Syncer({canvas: this, jump: options.jump});
			}
		}
	});
});