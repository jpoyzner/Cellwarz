////TODO: NOT USED BUT MAKE SURE THE LOGIC BEHIND ALL OF THESE IS IMPLEMENTED, then remove file

if (totalReqCount % (engineFramesPerSecond * 3) == 0) {
	refresh(false, false);
}
		
//TODO: still not sure why this was being done, perhaps when going through some door?
//		if (needsRefresh) {
//			refresh(true, false);
//			return;
//		}
		

		
//TODO: notice that all sprites are redrawn when this happens
//	} else if (keydowns.length != 0 || keyups.length != 0) {
//		refresh(true, false);
//	}