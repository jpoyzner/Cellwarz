define(['backbone', 'underscore',], function(Backbone, _) {
	return Backbone.View.extend({
		initialize: function(options) {
			this.canvas = options.canvas;
			
			var windowElement = $(window);
			this.windowWidth = windowElement.width();
			this.windowHeight = windowElement.height();
			this.offsetX = 0;
			this.offsetY = 0;
			
			this.cellText = "";
			
			this.bgImage = new Image();
			this.bgImage.src = 'images/bg/saturn.png';
			
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
			this.canvas.ctx.fillStyle = 'black';//"lightblue";
			this.canvas.ctx.fillRect(0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
			
			this.canvas.ctx.drawImage(
				this.bgImage,
				this.offsetX / 10 * -1,
				this.offsetY / 50 * -1);
				//window.innerWidth,
				//window.innerHeight);
			
			this.spriteIds = Object.keys(this.renderData);
			if (this.spriteIds.length == 0) {
				return;
			} 
			
			this.load(this.renderData);
			this.drawSprites();
			this.addScreenText();
			this.drawAvatarsNames();
			this.drawDashboardItems();
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
			this.canvas.ctx.fillText(this.cellText, 20, 70);
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
			if (Object.keys(this.tools).length != 0) {
				//TODO: the line below is causing MAD errors by trying to load a URL which is http://localhost:8080/Cellwarz/undefined
				//it's probably done some inefficient way also
				$('#mana1').css('background-image', 'url(\'' + this.imagePaths[this.tools[0]] + '\')');
				delete this.tools[0];
			}
		},
		removeDashboardItem: function() {
			$('#mana1').css('background-image', 'none');
		}
	});
});