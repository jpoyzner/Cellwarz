package com.poyznertech.cells;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.util.Timer;
import java.util.TimerTask;

import net.sf.json.JSONArray;
import net.sf.json.JSONObject;

import org.apache.catalina.websocket.MessageInbound;

public class SocketHub extends MessageInbound {
	public static final String CONNECT_PARAM = "connect";
    public static final String LOGIN_PARAM = "login";
	public static final String JUMP_PARAM = "jump";
	public static final String SPRITES_KEY = "sprites";
	public static final String AVATARS_KEY = "avatars";
	public static final String TOOLS_KEY = "tools";
	public static final String IMAGE_PATHS_KEY = "imagePaths";
	public static final String KEY_PARAM = "key";
	public static final String DOWN_PARAM = "down";
	
	private final World world;
	private String login;
	
	public SocketHub(World world) throws IOException {
		super();
		this.world = world;
	 }
	
	@Override
	protected void onTextMessage(CharBuffer message) throws IOException {
		JSONObject data = JSONObject.fromObject(message.toString());
		if (data.has(CONNECT_PARAM)) { //TODO: questionable efficiency
			login(data);
		} else {
			reactToKey(data);
		}
	}
		
	private final void login(JSONObject data) throws IOException {
		login = data.getString(LOGIN_PARAM);
		boolean jump = data.getBoolean(JUMP_PARAM);
		Session loginSession = world.getZion().getHardlines().get(login);
		
		Cell cell =
			loginSession == null || loginSession.unplugged() || jump ?
				world.getZion().getRandomEngine().getCell()
				: loginSession.getAvatar().getCell();
		
		cell.connect(login, jump);
		
		JSONObject jsonResponse = new JSONObject();
		jsonResponse.element(CONNECT_PARAM, "0"); //TODO: make this a constant and find more efficient way to do this?
		jsonResponse.element(SPRITES_KEY, JSONGenerator.getSprites(cell.getCellData().getSprites(), false, null));
		
		JSONObject avatars = new JSONObject();
		for (Session session: world.getZion().getHardlines().values()) {
			if (!session.unplugged()) {
				avatars.element(session.getAvatar().getName(), session.getAvatar().getCellIndex());
			}
		}
		jsonResponse.element(AVATARS_KEY, avatars);
		
		jsonResponse.element(TOOLS_KEY, JSONGenerator.getTools(world.getZion().getHardlines().get(login).getAvatar()));
		
		JSONArray imagePaths = new JSONArray();
		for (String imagePath: cell.getCellData().getImagePaths()) {
			imagePaths.element(imagePath);
		}
		jsonResponse.element(IMAGE_PATHS_KEY, imagePaths);
		
		getWsOutbound().writeTextMessage(CharBuffer.wrap(jsonResponse.toString()));
		getWsOutbound().flush();
		
		if (world.getZion().stale(login)) {
			world.getZion().loginNotStale(login);
		}
		
		new Timer().schedule(
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
				
				
		
		//TODO: don't forget to close the connection if possible in both methods, and on client also, maybe after client error too
	}
	
	public void renderClient() throws IOException {
		Session session = world.getZion().getHardlines().get(login); //TODO: can we get session from original call with websockets?
		
//		session.getUI().reactTo(
//			JSONArray.toCollection(JSONArray.fromObject(request.getParameter(KEYDOWNS_PARAM)), Integer.class),
//			JSONArray.toCollection(JSONArray.fromObject(request.getParameter(KEYUPS_PARAM)), Integer.class));

		
		Cell cell = session.getAvatar().getCell();
		
		JSONObject jsonObject = world.getZion().stale(login) ?
			new JSONObject()
			: JSONGenerator.getSprites(cell.getEngine().getRedrawSprites(), true, session.getAvatar());
		
//		if (cell.hasNewMessage()) {
//			jsonObject.element(MESSAGE_KEY, cell.getMessage());
//		}
			
		getWsOutbound().writeTextMessage(CharBuffer.wrap(jsonObject.toString()));
		getWsOutbound().flush();
	}
	
	private final void reactToKey(JSONObject data) {
		//TODO: can we get session from original call with websockets?
		world.getZion().getHardlines().get(login).getUI().reactTo(data.getInt(KEY_PARAM), data.getBoolean(DOWN_PARAM));
	}
	
	@Override
	protected void onBinaryMessage(ByteBuffer message) throws IOException {
		throw new UnsupportedOperationException("Binary message not supported.");
	}
}