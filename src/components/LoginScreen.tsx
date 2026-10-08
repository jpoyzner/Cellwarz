import { useState } from 'react';

interface LoginScreenProps {
  onEnter: (loginName: string, jump: boolean) => void;
}

export function LoginScreen({ onEnter }: LoginScreenProps) {
  const [loginName, setLoginName] = useState('');

  const handleSubmit = (jump: boolean) => (event: React.MouseEvent) => {
    event.preventDefault();
    if (loginName.length !== 0) {
      onEnter(loginName, jump);
    }
  };

  return (
    <div id="login">
      <div id="input">
        <form>
          Login:{' '}
          <input id="loginName" type="text" value={loginName} onChange={(event) => setLoginName(event.target.value)} />
          <input id="enter" type="submit" value="Reattach!" onClick={handleSubmit(false)} />
          <input id="random" type="submit" value="Enter randomly!" onClick={handleSubmit(true)} />
        </form>
      </div>
      <div id="desc">
        <p>
          Welcome to Cell Warz! You are about to jack into a multi-player, interactively creative, yet
          competitively destructive orbital grid with nothing but your ninja avatar. But fear not, by wielding the
          powers of the cell blocks, you can achieve great things!
          <br />
          <br />
          Instructions:
          <br />
          You can enter the grid in one of two ways: either by re-attaching to an existing avatar or by entering one
          of the random rooms. Once in a room you can travel to other rooms by entering a stargate portal. Be careful
          because you can be flatlined in this world, in which case you will have to re-enter as before (but perhaps
          your cell blocks might not be safe unless you are there).
          <br />
          <br />
          The cell blocks which you will encounter in this world can be activated when you are standing on them, in
          which case you will see "dashboard" icons appear in the top right corner. These will indicate which number
          keys you can press to use the cell block powers/weapons. Shatter the drifting neon data-blocks in the
          background to earn credits.
          <br />
          <br />
          Keys:
          <br />
          Up: jump
          <br />
          Left/Right: run
          <br />
          Down: activate/deactivate cell block
          <br />
          Spacebar: pick up or drop a cell block
        </p>
      </div>
    </div>
  );
}
