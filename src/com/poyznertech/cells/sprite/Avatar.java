package com.poyznertech.cells.sprite;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.CellData;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Engine;
import com.poyznertech.cells.Frame;
import com.poyznertech.cells.Physics;
import com.poyznertech.cells.Session;

public class Avatar extends Sprite {
	static final String STAND_RIGHT_ACTION = "stand_right";
	static final String STAND_LEFT_ACTION = "stand_left";
	static final String RUN_RIGHT_ACTION = "run_right";
	static final String RUN_LEFT_ACTION = "run_left";
	private static final String JUMP_RIGHT_ACTION = "jump_right";
	private static final String JUMP_LEFT_ACTION = "jump_left";
	private static final String FLOAT_RIGHT_ACTION = "float_right";
	private static final String FLOAT_LEFT_ACTION = "float_left";
	private static final String LAND_RIGHT_ACTION = "land_right";
	private static final String LAND_LEFT_ACTION = "land_left";
	
	static final int RUN_STEP_DISTANCE = 1;
	private static final int JUMP_DISTANCE = 1;
	
	private static final int FULL_JUMP_ACTION_LENGTH = 24;
	private static final int JUMP_ACTION_LENGTH = 10;
	private static final int FLOAT_ACTION_LENGTH = 8;
	private static final int START_FLOAT_INTERVAL = FULL_JUMP_ACTION_LENGTH - JUMP_ACTION_LENGTH;
	private static final int START_LAND_INTERVAL = START_FLOAT_INTERVAL - FLOAT_ACTION_LENGTH;
	
	static Map<String, List<Frame>> actionFrames = new HashMap<String, List<Frame>>();
	
	private final Cell cell;
	private final String name;
	
	private Session session;
	private Structure structure;
	private int structureChangeUpdate;
	private int firstDraw; //used for showing name only
	private Mana handledMana;
	
	private boolean facingRight;
	int yPower;
	int xPower;
	int slidePower;
	
	
	@Override
	public Map<String, List<Frame>> getActionFrames() {
		return actionFrames;
	}
	
	public static void init(CellData cellData) {
		addAction(cellData, STAND_RIGHT_ACTION, "me/stand", 6, 0, 1, 0, 1, false, actionFrames);
		addAction(cellData, STAND_LEFT_ACTION, "me/stand", 6, 0, 1, 0, 1, true, actionFrames);		
		addAction(cellData, RUN_RIGHT_ACTION, "me/run", 12, false, actionFrames);
		addAction(cellData, RUN_LEFT_ACTION, "me/run", 12, true, actionFrames);
		addAction(cellData, JUMP_RIGHT_ACTION, "me/jump", 1, false, actionFrames);
		addAction(cellData, JUMP_LEFT_ACTION, "me/jump", 1, true, actionFrames);
		addAction(cellData, FLOAT_RIGHT_ACTION, "me/float", 1, false, actionFrames);
		addAction(cellData, FLOAT_LEFT_ACTION, "me/float", 1, true, actionFrames);
		addAction(cellData, LAND_RIGHT_ACTION, "me/land", 1, false, actionFrames);
		addAction(cellData, LAND_LEFT_ACTION, "me/land", 1, true, actionFrames);
	}
	
	public Avatar(String name, int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super(x, y, cellInit, cell);
		this.name = name;
		this.cell = cell;
		firstDraw = Engine.REDRAW_ECHO_FRAMES;
		structureChangeUpdate = 0;
		facingRight = true;
		yPower = Physics.NONE;
		xPower = Physics.NONE;
		slidePower = Physics.NONE;
	}
	
	@Override
	public int getWidth() {
		return 6;
	}
	
	@Override
	public int getHeight() {
		return 8;
	}

	@Override
	protected String getDefaultAction() {
		return STAND_RIGHT_ACTION;
	}

	@Override
	void doAction() {
		if (yPower == Physics.NONE) {
			if (physics.touchSprite(this, Physics.NONE, Physics.DOWN, false)) {
				if (xPower == Physics.NONE) {
					setAnimationSequence(facingRight ? STAND_RIGHT_ACTION : STAND_LEFT_ACTION);
				} else {
					setAnimationSequence(facingRight ? RUN_RIGHT_ACTION : RUN_LEFT_ACTION);
				}
			} else {
				setAnimationSequence(facingRight ? LAND_RIGHT_ACTION : LAND_LEFT_ACTION);
			}
			
			physics.gravitate(this);
			adjustHandledMana();
		} else {
			if (yPower > START_FLOAT_INTERVAL) {
				setAnimationSequence(facingRight ? JUMP_RIGHT_ACTION : JUMP_LEFT_ACTION);
			} else if (yPower > START_LAND_INTERVAL) {
				setAnimationSequence(facingRight ? FLOAT_RIGHT_ACTION : FLOAT_LEFT_ACTION);
			}
			
			if (physics.move(this, Physics.NONE, Physics.UP, JUMP_DISTANCE)) {
				adjustHandledMana();
			} else {
				yPower = 1;
			}
			
			yPower --;
		}
		
		if (xPower != Physics.NONE) {
			if (engine.actionMatchesFrequency(Engine.HALF_STEP)) {
				if (physics.move(this, xPower, Physics.NONE, RUN_STEP_DISTANCE)) {
					adjustHandledMana();
				}
				
				for (Sprite sprite: physics.getSpritesAtSamePosition(this)) {
					if (sprite instanceof Portal) {
						((Portal)sprite).warpRandomly(this);
					}
				}
			}
		} else if (slidePower != Physics.NONE) {
			if (physics.move(this, slidePower, Physics.NONE, RUN_STEP_DISTANCE)) {
				adjustHandledMana();
			}
			
			slidePower = Physics.NONE;
		}
		
		checkStructureConnection();

		if (firstDraw != 0) {
			firstDraw--;
		}
		
		if (structureChangeUpdate != 0) {
			structureChangeUpdate--;
		}
	}
	
	//TODO: issue when walking under something just tall enough for avatar when handling mana
	private final void adjustHandledMana() {
		if (handledMana != null) {
			physics.moveTo(handledMana, getX() + 1, getY() - handledMana.getHeight()); 
		}
	}
	
	private final void checkStructureConnection() {
		if (structure != null) {
			for (Sprite sprite: physics.getSpritesUnder(this, Physics.NONE, 0)) {
				if (sprite instanceof Mana && ((Mana)sprite).getStructure() == structure) {
					return;
				}
			}
			
			toggleConnectToStructure();
		}
	}

	@Override
	boolean animate() {
		return true;
	}
	
	@Override
	public int getAnimationFrequency() {
		if (getAnimationSequence() == STAND_LEFT_ACTION || getAnimationSequence() == STAND_RIGHT_ACTION ) {
			return Engine.QUARTER_STEP;
		} else if (getAnimationSequence() == RUN_LEFT_ACTION || getAnimationSequence() == RUN_RIGHT_ACTION ) {
			return Engine.HALF_STEP;
		}
		
		return Engine.ALL_STEPS;
	}
	
	@Override
	public int getLayer() {
		return Physics.OBJECT_LAYER;
	}
	
	public void runLeft() {
		if (structure == null) {
			xPower = Physics.LEFT;
			facingRight = false;
		}
	}
	
	public void runRight() {
		if (structure == null) {
			xPower = Physics.RIGHT;
			facingRight = true;
		}
	}
	
	public void stopRunning() {
		slidePower = xPower;
		xPower = Physics.NONE;
	}
	
	public void attemptJump() {
		if (structure == null && yPower == Physics.NONE && physics.touchSprite(this, Physics.NONE, Physics.DOWN, false)) {
			yPower = FULL_JUMP_ACTION_LENGTH;
    	}
	}

	public String getName() {
		return name;
	}
	
	public boolean showName() {
		return firstDraw > 0;
	}
	
	public boolean needsStructureChangeUpdate() {
		return structureChangeUpdate > 0;
	}
	
	public void die() {
		Session session = cell.getWorld().getZion().getHardlines().get(name);
		if (session != null) {
			session.unplug();
		}
		
		removePermanently();
	}

	public Structure getStructure() {
		return structure;
	}

	@Override
	public boolean melts() {
		return true;
	}
	
	//TODO: just gets the first mana's structure, should start search for connecting manas as a structure
	public void toggleConnectToStructure() {
		if (structure == null) {
			for (Sprite sprite: physics.getSpritesUnder(this, Physics.NONE, 0)) {
				if (sprite instanceof Mana) {
					setStructure(((Mana)sprite).getStructure());
					break;
				}
			}
		} else {
			structure.deactivateAllManaActions();
			setStructure(null);
		}
	}

	public Avatar setStructure(Structure structure) {
		this.structure = structure;
		
		if (structure != null) {
			this.structure.setAvatar(this);
		}
		
		structureChangeUpdate = Engine.REDRAW_ECHO_FRAMES;
		return this;
	}

	//TODO: need to check if mana can be moved up and whether avatar can be moved down (and vise-versa for setting down)
	public void toggleHandleMana() {
		if (handledMana == null) {
			for (Sprite sprite: physics.getSpritesUnder(this, Physics.NONE, 0)) { //just tries to pick up first mana
				if (sprite instanceof Mana) {
					Mana mana = (Mana)sprite;
					mana.handleMelt();
					physics.move(this, Physics.NONE, Physics.DOWN, mana.getHeight());
					physics.move(mana, Physics.NONE, Physics.UP, getHeight());
					mana.removeHandleMelt();
					mana.beingHandled();
					handledMana = mana;
					break;
				}
			}
		} else {
			handledMana.handleMelt();
			physics.move(handledMana, Physics.NONE, Physics.DOWN, getHeight());
			physics.move(this, Physics.NONE, Physics.UP, handledMana.getHeight());
			handledMana.removeHandleMelt();
			setManaDown();
		}
	}
	
	public void setManaDown() {
		if (handledMana != null) {
			handledMana.setDown();
			handledMana = null;
		}
	}
	
	public final void activateManaAction(int manaIndex, int actionIndex) {
		Structure structure = getStructure();
    	if (structure != null) {
    		structure.activateManaAction(manaIndex, actionIndex);
    	}
	}

	public Session getSession() {
		return session;
	}

	public void setSession(Session session) {
		this.session = session;
	}
}
