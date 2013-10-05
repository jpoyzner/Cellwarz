function ajaxSync() {
	$.ajax({
		type: 'POST',
		url: '/Cellwarz/sync',
		data: {login: loginName, keydowns: JSON.stringify(keydowns), keyups: JSON.stringify(keyups)},
		success: function(data) {
			ctx.fillStyle = "lightblue";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			
			spriteIds = Object.keys(data);
			if (spriteIds.length == 0) {
				needsRefresh = true;
				sync();
				return;
			} 
			
			load(data);
			
			spriteIds = Object.keys(sprites);
			for (var i = 0; i < spriteIds.length; i++) {
				sprite = sprites[spriteIds[i]];
				if (sprite[0] != -1) {
					ctx.drawImage(images[sprite[0]], sprite[1], sprite[2]);
				}
			}

			ctx.fillStyle = "red";
			ctx.font = "bold 16px Arial";
			
			//if (totalReqCount % 5 == 0) {
			//	text = "Fail Rate: " + (timedOutCount * 100 / totalReqCount) + "%";
				
				//"InactivityCount: " + inactivityCount;
			//}

			ctx.fillText(loginName + ": " + text, 98, 98);
			
			ctx.fillStyle = "darkred";
			ctx.fillText(cellText, 98, 148);
			
			avatarNames = Object.keys(avatars);
			for (i = 0; i < avatarNames.length; i++) {
				name = avatarNames[i];
				sprite = sprites[avatars[name]];
				
				if (sprite) {
					ctx.fillText(name, sprite[1] - 8, sprite[2] - 16);
				} else {
					delete avatars[name];
				}
			}
			
			if (Object.keys(tools).length != 0) {
				$('#mana1').css('background-image', 'url(\'' + imagePaths[tools[0]] + '\')');
				delete tools[0];
			}
			
			timedOut = false;
			sync();
		}, timeout: 100}) //This has to be a balance between requests that stall and requests that take too long ...
	.fail(function() {
		sync();
		timedOut = true;
		timedOutCount++;
	});
}