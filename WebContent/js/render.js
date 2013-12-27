function render(data) {
	ctx.fillStyle = 'black';//"lightblue";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	ctx.drawImage(
		bgImage,
		offsetX / 10 * -1,
		offsetY / 50 * -1);
		//window.innerWidth,
		//window.innerHeight);
	
	spriteIds = Object.keys(data);
	if (spriteIds.length == 0) {
		needsRefresh = true;
		sync();
		return;
	} 
	
	load(data);
	drawSprites();
	addScreenText();
	drawAvatarsNames();
	drawDashboardItems();
	
	timedOut = false;
	//sync();
}

function drawSprites() {
	offsetX = 0;
	offsetY = 0;
	
	me = sprites[avatars[loginName]];
	if (me) {
		//TODO: avatar sizes should be dynamic
		offsetX = me[1] + 24 - windowWidth / 2;
		offsetY = me[2] + 16 - windowHeight / 2;
	}	
	
	spriteIds = Object.keys(sprites);
	for (var i = 0; i < spriteIds.length; i++) {
		sprite = sprites[spriteIds[i]];
		if (sprite[0] != -1) {
			ctx.drawImage(images[sprite[0]], sprite[1] - offsetX, sprite[2] - offsetY);
		}
	}
}

function drawStaleScreen() {
	ctx.fillStyle = "gray";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	drawSprites();
}

function addScreenText() {
	ctx.fillStyle = "red";
	ctx.font = "bold 16px Arial";
	
//	if (totalReqCount % 5 == 0) {
//		text = "Fail Rate: " + (timedOutCount * 100 / totalReqCount) + "%";
//		
//		//"InactivityCount: " + inactivityCount;
//	}

	ctx.fillText(loginName + ": " + text, 20, 20);
	
	ctx.fillStyle = "#FF9933";//"darkred";
	ctx.fillText(cellText, 20, 70);
}

function drawAvatarsNames() {
	avatarNames = Object.keys(avatars);
	for (var i = 0; i < avatarNames.length; i++) {
		name = avatarNames[i];
		sprite = sprites[avatars[name]];
		
		if (sprite) {
			ctx.fillText(name, sprite[1] - 8 - offsetX, sprite[2] - 16 - offsetY);
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