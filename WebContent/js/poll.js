function sync() {
	setTimeout("poll()", refreshRate);
}

function poll() {
	if (inactivityCount < inactivityTimeout) {
		if (timedOut) {
			for (var i = 0; i < keydowns.length; i++) {
				keyups[keyups.length] = keydowns[i];
			}
		}
		
		if (totalReqCount % (engineFramesPerSecond * 3) == 0) {
			refresh(false, false);
		}
		
		if (needsRefresh) {
			refresh(true, false);
			return;
		}
		
		ajaxSync();
		
		inactivityCount++;
		totalReqCount++;
		
		
		if (totalReqCount % 18 == 0) {
			me = sprites[avatars[loginName]];
			if (me) {
				window.scrollTo(me[1] - 576, me[2] - 448);
			}
		}
		
		if (totalReqCount % 250 == 0) {
			totalReqCount = 0;
			timedOutCount = 0;
		}
		
		if (keydowns.length != 0) {
			keydowns = new Array();
			inactivityCount = 0;
		}
		
		if (keyups.length != 0) {
			keyups = new Array();
			inactivityCount = 0;
		}
	} else if (inactivityCount == inactivityTimeout) {
		ctx.fillStyle = "gray";
		ctx.fillRect(0, 0, 1152, 896);
		
		spriteIds = Object.keys(sprites);
		for (i = 0; i < spriteIds.length; i++) {
			sprite = sprites[spriteIds[i]];
			ctx.drawImage(images[sprite[0]], sprite[1], sprite[2]);
		}
		
		inactivityCount++;
		sync();
	} else if (keydowns.length != 0 || keyups.length != 0) {
		refresh(true, false);
	} else {
		sync();
	}
}