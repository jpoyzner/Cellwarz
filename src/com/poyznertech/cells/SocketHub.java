package com.poyznertech.cells;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;

import net.sf.json.JSONArray;
import net.sf.json.JSONObject;

import org.apache.catalina.websocket.MessageInbound;

public class SocketHub extends MessageInbound {
	public static final String CONNECT_PARAM = "connect";
	public static final String INACTIVE_PARAM = "inactive";
	//public static final String DUMP_CONNECT_PARAM = "dump";
	public static final String MESSAGE_PARAM = "message";
    public static final String LOGIN_PARAM = "login";
	public static final String JUMP_PARAM = "jump";
	public static final String SPRITES_KEY = "sprites";
	public static final String AVATARS_KEY = "avatars";
	public static final String TOOLS_KEY = "tools";
	public static final String IMAGE_PATHS_KEY = "imagePaths";
	public static final String CELL_WIDTH_KEY = "width";
	public static final String CELL_HEIGHT_KEY = "height";
	public static final String KEY_PARAM = "key";
	public static final String DOWN_PARAM = "down";
	private static final int TIMEOUT = 3000;
	
	private final World world;
	private String login;
	private Timer timer;
	private int inactivityCount;
	private Session session;
	
	public SocketHub(World world) throws IOException {
		super();
		this.world = world;
	 }
	
	@Override
	protected void onTextMessage(CharBuffer message) throws IOException {
		JSONObject data = JSONObject.fromObject(message.toString());
		if (data.has(CONNECT_PARAM)) { //TODO: questionable efficiency
			login(data);
		} else if (data.has(MESSAGE_PARAM)) {
			newMessage(data);
		} else {
			reactToKey(data);
		}
	}
		
	private final void login(JSONObject data) throws IOException {
		boolean jump = false;
		if (login == null) {
			login = data.getString(LOGIN_PARAM);
			jump = data.getBoolean(JUMP_PARAM);
		}
		
		Zion zion = world.getZion();
		Map<String, Session> hardlines = zion.getHardlines();
		session = hardlines.get(login);
		Cell cell;
		
		if (session == null) {
			cell = zion.getRandomEngine().getCell();
			hardlines.put(login, new Session(cell.addAvatarAtEntrance(login)));
		} else if (session.unplugged() || jump) {
			cell = zion.getRandomEngine().getCell();
			session.plugin(cell.addAvatarAtEntrance(login));
		} else {
			cell = session.getAvatar().getCell();
		}

		getWsOutbound().writeTextMessage(CharBuffer.wrap(getCellState(cell).toString()));
		getWsOutbound().flush();
		
		world.getZion().loginNotStale(login);
		
		startRendering();
	}
	
	private final void newMessage(JSONObject data) {
		world.getZion().getHardlines().get(login).getAvatar().getCell().postMessage(login + ": " + data.getString(MESSAGE_PARAM));
	}
	
	private final void startRendering() {
		inactivityCount = 0;
		
		if (timer != null) {
			timer.cancel();
		}
		
		timer = new Timer();
		timer.schedule(
			new TimerTask() {
				public void run() {
					try {
						renderClient();
					} catch (IOException e) {
						e.printStackTrace();
						cancel();
						try {
							getWsOutbound().close(0, null);
						} catch (IOException e1) {
							e1.printStackTrace();
						}
					}
				}
			},
			0,
			1000 / Engine.ENGINE_FRAMES_PER_SECOND);
	}
	
	public void renderClient() throws IOException {
		if (inactivityCount == TIMEOUT) { //TODO: inactivity count no longer handled client-side
			timer.cancel();
			getWsOutbound().writeTextMessage(CharBuffer.wrap(new JSONObject().element(CONNECT_PARAM, INACTIVE_PARAM).toString()));
			return;
		}
		
		Session session = world.getZion().getHardlines().get(login);
		//TODO: tried to replace with "session" but got null pointers, might be related to same thing happening in portal warp
		
		Cell cell = session.getAvatar().getCell();
		
		boolean needsRefresh = world.getZion().stale(login);
		
		JSONObject jsonObject =
			needsRefresh ?
				getCellState(cell)
				: JSONGenerator.getSprites(cell.getEngine().getRedrawSprites(), true, session.getAvatar());
		
				
		//TODO: the whole chat system needs to be redone with a history of chat and limit to one second refresh
		if (cell.hasNewMessage()) {
			jsonObject.element(MESSAGE_PARAM, cell.getMessage());
		}
			
		getWsOutbound().writeTextMessage(CharBuffer.wrap(jsonObject.toString()));
		getWsOutbound().flush();
		
		if (needsRefresh) {
			world.getZion().loginNotStale(login);
		}
		
		inactivityCount++;
	}
	
	private final JSONObject getCellState(Cell cell) {
		JSONObject jsonResponse = new JSONObject();
		jsonResponse.element(CONNECT_PARAM, "0");
		jsonResponse.element(SPRITES_KEY, JSONGenerator.getSprites(cell.getCellData().getSprites(), false, null));
		
		JSONObject avatars = new JSONObject();
		for (Session avtarSession: world.getZion().getHardlines().values()) {
			if (!avtarSession.unplugged()) {
				avatars.element(avtarSession.getAvatar().getName(), avtarSession.getAvatar().getCellIndex());
			}
		}
		jsonResponse.element(AVATARS_KEY, avatars);
		
		jsonResponse.element(TOOLS_KEY, JSONGenerator.getTools(world.getZion().getHardlines().get(login).getAvatar()));
		
		JSONArray imagePaths = new JSONArray();
		for (String imagePath: cell.getCellData().getImagePaths()) {
			imagePaths.element(imagePath);
		}
		jsonResponse.element(IMAGE_PATHS_KEY, imagePaths);
		
		return jsonResponse;
	}
	
	private final void reactToKey(JSONObject data) throws IOException {
		Session session = world.getZion().getHardlines().get(login);
		
		int key = data.getInt(KEY_PARAM);
		//System.out.println(key);
		//if (key == 187) { //=
			//dumpCellContents(session.getAvatar().getCell());
		//} else {
			//TODO: can we get session from original call with websockets?
			session.getUI().reactTo(key, data.getBoolean(DOWN_PARAM));
			
			if (inactivityCount == TIMEOUT) {
				login(null);
			}
			
			inactivityCount = 0;
		//}
	}
	
//	private final void dumpCellContents(Cell cell) throws IOException {
//		JSONObject jsonResponse = new JSONObject();
//		jsonResponse.element(CONNECT_PARAM, DUMP_CONNECT_PARAM);
//		jsonResponse.element(CELL_WIDTH_KEY, cell.getWidth());
//		jsonResponse.element(CELL_HEIGHT_KEY, cell.getHeight());
//		jsonResponse.element(SPRITES_KEY, JSONGenerator.getSprites(cell.getCellData().getSprites(), false, null));
//		
//		getWsOutbound().writeTextMessage(CharBuffer.wrap(jsonResponse.toString()));
//		getWsOutbound().flush();
//	}
	
	@Override
	protected void onBinaryMessage(ByteBuffer message) throws IOException {
		throw new UnsupportedOperationException("Binary message not supported.");
	}
}