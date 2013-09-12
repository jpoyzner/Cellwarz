package com.poyznertech.cells.sprite;

import java.util.ArrayList;
import java.util.List;

public class Structure {
	private final List<Mana> manas;
	private Avatar avatar;
	
	public Structure() {
		manas = new ArrayList<Mana>();
	}
	
	public final Structure addMana(Mana mana) {
		manas.add(mana);
		mana.setStructure(this);
		return this;
	}
	
	public final Structure removeMana(Mana mana) {
		manas.remove(mana);
		mana.setStructure(null);
		return this;
	}
	
	public final List<Mana> getManas() {
		return manas;
	}
	
	public void deactivateAllManaActions() {
		for (Mana mana: manas) {
			mana.deactivateAllActions();
		}
	}
	
	public void activateManaAction(int manaIndex, int actionIndex) {
    	manas.get(manaIndex).activateAction(actionIndex);
	}
	
	public void deactivateManaAction(int manaIndex, int actionIndex) {
		manas.get(manaIndex).deactivateAction(actionIndex);
	}

	public Avatar getAvatar() {
		return avatar;
	}

	public void setAvatar(Avatar avatar) {
		this.avatar = avatar;
	}
}
