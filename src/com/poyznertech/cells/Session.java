package com.poyznertech.cells;

import com.poyznertech.cells.sprite.Avatar;

public class Session {
	private Avatar avatar;
	private final UI UI;
	
	public Session(Avatar avatar) {
		this.avatar = avatar;
		UI = new UI(avatar);
	}

	public UI getUI() {
		return UI;
	}

	public Avatar getAvatar() {
		return avatar;
	}
	
	public final void plugin(Avatar avatar) {
		if (this.avatar != null) {
			this.avatar.setManaDown();
			this.avatar.removePermanently();
		}
		
		this.avatar = avatar;
		UI.plugin(avatar);
	}
	
	public final boolean unplugged() {
		return avatar == null;
	}
	
	public final void unplug() {
		avatar.setManaDown();
		avatar = null;
		UI.unplug();
	}
}
