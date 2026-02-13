'use client';

import { useState } from 'react';

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    // Dispatch custom event to enable stream controls
    window.dispatchEvent(new CustomEvent('streamEnabled'));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <h2 className="modal-title">How it works?</h2>

        <p className="modal-description">
          MachineGoBrrr lets <span className="text-highlight">anyone</span> take control of the live AutoBlow session.
          The device reacts to the active chart loaded in MachineGoBrrr.
        </p>

        <div className="modal-steps">
          <p className="modal-step">
            Connect Phantom
          </p>
          <p className="modal-step">
            Enter token address and choose tier
          </p>
          <p className="modal-step">
            Pay and watch machine sync and go brr
          </p>
          <p className="modal-step">
            <span className="step-label">Standard</span> = 10 minutes
          </p>
          <p className="modal-step">
            <span className="step-label">Priority</span> = Jump queue
          </p>
        </div>

        <button className="modal-button" onClick={handleClose}>
          I&apos;m ready to go brrr
        </button>

        <div className="modal-footer">
          Built for <a href="https://sessionmint.fun" target="_blank" rel="noopener noreferrer">SessionMint.fun</a>
          <p className="modal-disclaimer">No official token endorsement is provided by SessionMint.fun.</p>
          <p className="modal-notice">MachineGoBrrr is an entertainment experience. Device synchronization is best effort.</p>
        </div>
      </div>
    </div>
  );
}
