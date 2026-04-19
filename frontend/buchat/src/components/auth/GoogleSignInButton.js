import React from 'react';
import { GoogleLogin } from '@react-oauth/google';

const GoogleSignInButton = ({ onSuccess, onError }) => {
  return (
    <div className="google-signin-wrapper">
      <GoogleLogin
        onSuccess={onSuccess}
        onError={onError}
        theme="outline"
        size="large"
        text="continue_with"
        width="400"
        shape="rectangular"
        logo_alignment="left"
      />
    </div>
  );
};

export default GoogleSignInButton;