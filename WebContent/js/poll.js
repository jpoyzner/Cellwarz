function sync() {
	setTimeout("poll()", refreshRate);
}

function poll() {
	if (inactivityCount < inactivityTimeout) {
		//reset keys if timed out
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
		
		scrollToAvatar();
		
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
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		drawSprites();
		inactivityCount++;
		sync();
	} else if (keydowns.length != 0 || keyups.length != 0) {
		refresh(true, false);
	} else {
		sync();
	}
}

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
			drawSprites();
			addScreenText();
			drawAvatarsNames();
			drawDashboardItems();
			
			timedOut = false;
			sync();
		}, timeout: 100}) //This has to be a balance between requests that stall and requests that take too long ...
	.fail(function() {
		sync();
		timedOut = true;
		timedOutCount++;
	});
}

function scrollToAvatar() {
	if (totalReqCount % 18 == 0) {
		me = sprites[avatars[loginName]];
		if (me) {
			window.scrollTo(me[1] - 576, me[2] - 448);
		}
	}
}