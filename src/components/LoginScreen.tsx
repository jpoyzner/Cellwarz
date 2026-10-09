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
          completely. The cell blocks which you will encounter in this world are light enough to shove around, and each
          colour behaves differently: touch or pick one up and see what happens. Break a rainbow block by throwing it
          and collect the blue diamonds it leaves behind.
          <br />
          <br />
          Watch out for the ninja robots! They look like us but they will reprogram you on contact, and when they spot
          you from a distance they pull out a rocket launcher.
          <br />
          <br />
          Keys:
          <br />
          Up: jump
          <br />
          Left/Right: run
          <br />
          Down: put down the cell block you are carrying
          <br />
          Spacebar: pick up the cell block you are standing on; press it again to throw it
          <br />
          Escape: leave the grid and return to this screen (your avatar stays put; use Reattach! to return to it)
        </p>
      </div>
    </div>
  );
}
