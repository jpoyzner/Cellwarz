function drawSprites() {
	spriteIds = Object.keys(sprites);
	for (var i = 0; i < spriteIds.length; i++) {
		sprite = sprites[spriteIds[i]];
		if (sprite[0] != -1) {
			ctx.drawImage(images[sprite[0]], sprite[1], sprite[2]);
		}
	}
}

function addScreenText() {
	ctx.fillStyle = "red";
	ctx.font = "bold 16px Arial";
	
	//if (totalReqCount % 5 == 0) {
	//	text = "Fail Rate: " + (timedOutCount * 100 / totalReqCount) + "%";
		
		//"InactivityCount: " + inactivityCount;
	//}

	ctx.fillText(loginName + ": " + text, 98, 98);
	
	ctx.fillStyle = "darkred";
	ctx.fillText(cellText, 98, 148);
}

function drawAvatarsNames() {
	avatarNames = Object.keys(avatars);
	for (var i = 0; i < avatarNames.length; i++) {
		name = avatarNames[i];
		sprite = sprites[avatars[name]];
		
		if (sprite) {
			ctx.fillText(name, sprite[1] - 8, sprite[2] - 16);
		} else {
			delete avatars[name];
		}
	}
}

function drawDashboardItems() {
	if (Object.keys(tools).length != 0) {
		$('#mana1').css('background-image', 'url(\'' + imagePaths[tools[0]] + '\')');
		delete tools[0];
	}
}

function removeDashboardItem() {
	$('#mana1').css('background-image', 'none');
}