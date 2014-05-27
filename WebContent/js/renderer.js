define(['backbone', 'underscore'], function() {
	return Backbone.View.extend({
		background: $('#canvas-bg'),
		initialize: function(options) {
			this.canvas = options.canvas;
			
			var windowElement = $(window);
			this.windowWidth = windowElement.width();
			this.windowHeight = windowElement.height();
			this.offsetX = 0;
			this.offsetY = 0;
			
			this.cellText = "";
			
			//this.bgImage = new Image();
			//this.bgImage.src = 'images/bg/temple1.png';
			
//			requestAnimationFrame =
//				requestAnimationFrame || mozRequestAnimationFrame || webkitRequestAnimationFrame || msRequestAnimationFrame;
//			
//			this.step = _.bind(function step() {
//				if (this.renderData) {
//					this.render();
//				}
//				
//			    requestAnimationFrame(this.step);
//			}, this);
//			
//			requestAnimationFrame(this.step);
		},
		render: function() {
			//this.canvas.ctx.fillStyle = 'black';//"lightblue";
			//this.canvas.ctx.fillRect(0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
			this.canvas.ctx.clearRect(0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
			
			this.background.css({left: (this.offsetX / 10 * -1) - 55, top: (this.offsetY / 50 * -1) - 20});
			
			this.spriteIds = Object.keys(this.renderData);
			if (this.spriteIds.length == 0) {
				return;
			} 
			
			this.load(this.renderData);
			this.drawSprites();
			this.addScreenText();
			this.drawAvatarsNames();
			this.drawDashboardItems();
			
			if (this.canvas.analyzer) {
				this.canvas.analyzer.redraws++;
				this.canvas.analyzer.drawTime = Date.now() - this.canvas.analyzer.connectionTime;
			}
		},
		load: function(data) {
			for (var i = 0; i < this.spriteIds.length; i++) {
				if (this.spriteIds[i] == "message") {
					this.cellText = data["message"];
				} else {
					var spriteId = this.spriteIds[i];
					var newSprite = data[spriteId];
					
					if (newSprite[0] == "-1") {
						if (this.sprites[spriteId]) {
							delete this.sprites[spriteId];
						}
					} else {
						this.sprites[spriteId] = [newSprite[0], newSprite[1], newSprite[2]];
						
						var extraInfo = newSprite[3];
						if (extraInfo) {
							var avatarName = extraInfo["0"];
							if (avatarName) {
								this.avatars[avatarName] = spriteId;
							}
							
							var newTools = extraInfo["1"];
							if (newTools) {
								if (newTools["-1"]) {
									this.removeDashboardItem();
								} else {
									this.tools = newTools;
								}
							}
						}
					}
				}
			}
		},
		drawSprites: function() {
			this.offsetX = 0;
			this.offsetY = 0;
			
			var me = this.sprites[this.avatars[this.canvas.loginName]];
			if (me) {
				//TODO: avatar sizes should be dynamic
				this.offsetX = me[1] + 24 - this.windowWidth / 2;
				this.offsetY = me[2] + 16 - this.windowHeight / 2;
			}	
			
			this.spriteIds = Object.keys(this.sprites);
			for (var i = 0; i < this.spriteIds.length; i++) {
				var sprite = this.sprites[this.spriteIds[i]];
				if (sprite[0] != -1) {
					this.canvas.ctx.drawImage(this.canvas.images[sprite[0]], sprite[1] - this.offsetX, sprite[2] - this.offsetY);
				}
			}
		},
		drawStaleScreen: function() {
			//TODO: I think there's an issue where if you go stable, then on another browser you go somewhere else, it will mess things up
			
			this.canvas.ctx.fillStyle = "gray";
			this.canvas.ctx.fillRect(0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
			this.drawSprites();
		},
		addScreenText: function() {
			this.canvas.ctx.fillStyle = "red";
			this.canvas.ctx.font = "bold 16px Arial";
			
//			if (totalReqCount % 5 == 0) {
//				text = "Fail Rate: " + (timedOutCount * 100 / totalReqCount) + "%";
//				
//				//"InactivityCount: " + inactivityCount;
//			}

			this.canvas.ctx.fillText(this.canvas.loginName + ": " + this.canvas.text, 20, 20);
			
			this.canvas.ctx.fillStyle = "#FF9933";//"darkred";
			this.canvas.ctx.fillText(this.canvas.analyzer ? this.canvas.analyzer.state : this.cellText, 20, 70);
		},
		drawAvatarsNames: function() {
			var avatarNames = Object.keys(this.avatars);
			for (var i = 0; i < avatarNames.length; i++) {
				var name = avatarNames[i];
				var sprite = this.sprites[this.avatars[name]];
				
				if (sprite) {
					this.canvas.ctx.fillText(name, sprite[1] - 8 - this.offsetX, sprite[2] - 16 - this.offsetY);
				} else {
					delete this.avatars[name];
				}
			}
		},
		drawDashboardItems: function() {
			if (Object.keys(this.tools).length != 0) { //TODO: why is this always true? happens every render!
				var url = this.imagePaths[this.tools[0]];
				if (url) {
					$('#mana1').css('background-image', "url('" + url + "')");
				}
				
				delete this.tools[0]; //maybe because this or something
			}
		},
		removeDashboardItem: function() {
			$('#mana1').css('background-image', 'none');
		}
	});
});