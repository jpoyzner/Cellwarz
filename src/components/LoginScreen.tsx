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
          <input id="random" type="submit" value="Respawn" onClick={handleSubmit(true)} />
        </form>
      </div>
      <div id="desc">
        <p>
          Welcome raver! You are about to jack into a multi-player, interactively creative, yet competitively
          destructive orbital grid with nothing but your ninja avatar. But fear not, by wielding the powers of the
          cell blocks, you can achieve great things!
          <br />
          <br />
          Instructions:
          <br />
          You can enter the grid in one of two ways: either by re-attaching to an existing avatar or by respawning
          completely. The cell blocks which you will encounter in this world can be activated when you are standing on
          them, in which case you will see "dashboard" icons appear in the top right corner. These will indicate which
          number keys you can press to use the cell block powers/weapons.
          <br />
          <br />
          Watch out for the ninja robots! They look like us but they will reprogram you on contact.
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
          <br />
          Escape: leave the grid and return to this screen (your avatar stays put; use Reattach! to return to it)
        </p>
      </div>
    </div>
  );
}
