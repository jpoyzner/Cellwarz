package com.poyznertech.cells;

import java.util.Collection;

import com.poyznertech.cells.sprite.Avatar;
import com.poyznertech.cells.sprite.Structure;

public class UI {
	private Avatar avatar;
	
	public UI(Avatar avatar) {
		plugin(avatar);
	}

	void reactTo(Collection<Integer> keydowns, Collection<Integer> keyups) {
		if (!unplugged()) {
			for (int key: keydowns) {
				if (key == 37) { //left
					avatar.runLeft();
			    } else if (key == 38) { //up
			    	avatar.attemptJump();
			    } else if (key == 39) { //right
			    	avatar.runRight();
			    } else if (key == 40) { //down
			    	avatar.toggleConnectToStructure();
			    } else if (key == 32) { //spacebar
			    	avatar.toggleHandleMana();
			    } else if (key == 49) { //1
			    	avatar.activateManaAction(0, 0);
			    } else if (key == 50) { //2
			    	avatar.activateManaAction(0, 1);
			    } else if (key == 51) { //3
			    	avatar.activateManaAction(0, 2);
			    } else if (key == 27) {  //esc
					//avatar.die(); //TODO: should be replaced by a freeze call eventually
			    	//TODO: perhaps make button on screen to go back to main menu
				} 
			}
			
			for (int key: keyups) {
				if (key == 37 || key == 39) { 
					avatar.stopRunning();
			    } else if (key == 49) { //1
			    	Structure structure = avatar.getStructure();
			    	if (structure != null) {
			    		avatar.getStructure().deactivateManaAction(0, 0);
			    	}
			    } else if (key == 50) { //2
			    	Structure structure = avatar.getStructure();
			    	if (structure != null) {
			    		avatar.getStructure().deactivateManaAction(0, 1);
			    	}
			    } else if (key == 51) { //3
			    	Structure structure = avatar.getStructure();
			    	if (structure != null) {
			    		avatar.getStructure().deactivateManaAction(0, 2);
			    	}
				}
			}
		}
	}
	
	public final void plugin(Avatar avatar) {
		this.avatar = avatar;
	}
	
	public final void unplug() {
		avatar = null;
	}
	
	public final boolean unplugged() {
		return avatar == null;
	}

	//OLD CLICK HANDLER FROM JS:
	//public void click(int x, int y) {
	//	UI.click(x / CellData.ANIMATION_STEP, y / CellData.ANIMATION_STEP);
	//}
}
