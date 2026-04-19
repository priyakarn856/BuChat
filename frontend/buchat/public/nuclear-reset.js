// NUCLEAR RESET - Run BEFORE logging in
// This completely wipes all encryption data from server and local storage

(async function nuclearReset() {
  console.log('🚨 NUCLEAR RESET INITIATED');
  console.log('This will delete ALL encryption data from server and browser');
  
  const proceed = confirm(
    '⚠️ NUCLEAR RESET ⚠️\n\n' +
    'This will:\n' +
    '1. Delete cloud backup from server\n' +
    '2. Delete key bundle from server\n' +
    '3. Clear all local encryption keys\n' +
    '4. Clear bundle version cache\n\n' +
    'You MUST refresh the page after this.\n\n' +
    'Continue?'
  );
  
  if (!proceed) {
    console.log('❌ Reset cancelled');
    return;
  }

  try {
    // Extract userId from JWT token
    const token = localStorage.getItem('token');
    if (!token) {
      alert('❌ Not logged in! Please login first, then run this script.');
      return;
    }

    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.userId || payload.sub || payload.id;
    
    if (!userId) {
      alert('❌ Could not extract userId from token');
      return;
    }

    console.log('🔑 Found userId:', userId);

    // Step 1: Delete cloud backup and bundle from server
    console.log('🗑️ Step 1: Deleting cloud data from server...');
    try {
      const deleteResponse = await fetch(`/api/keybackup/reset/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (deleteResponse.ok) {
        console.log('✅ Server cloud data deleted');
      } else if (deleteResponse.status === 404) {
        console.log('ℹ️ No cloud data found on server (already clean)');
      } else {
        const errorText = await deleteResponse.text();
        console.error('⚠️ Server delete failed:', deleteResponse.status, errorText);
      }
    } catch (error) {
      console.error('⚠️ Server delete error:', error.message);
    }

    // Step 2: Delete server key bundle (redundant but safe)
    console.log('🗑️ Step 2: Deleting public key bundle from server...');
    try {
      const bundleResponse = await fetch(`/api/keybackup/bundle/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (bundleResponse.ok) {
        console.log('✅ Server bundle deleted');
      } else if (bundleResponse.status === 404) {
        console.log('ℹ️ No bundle found on server');
      } else {
        const errorText = await bundleResponse.text();
        console.error('⚠️ Bundle delete failed:', bundleResponse.status, errorText);
      }
    } catch (error) {
      console.error('⚠️ Bundle delete error:', error.message);
    }

    // Step 3: Clear local storage encryption data
    console.log('🗑️ Step 3: Clearing local encryption data...');
    
    const keysToRemove = [
      'signal_store',
      'signal_signed_prekey_cache',
      `bundle_version_${userId}`,
      `self_enc_key_${userId}`
    ];

    keysToRemove.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log(`  ✅ Removed: ${key}`);
      }
    });

    // Step 4: Clear any bundle version cache for all users
    console.log('🗑️ Step 4: Clearing bundle version cache...');
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('bundle_version_')) {
        localStorage.removeItem(key);
        console.log(`  ✅ Removed: ${key}`);
      }
    });

    // Step 5: Set flag to skip cloud restore on next login
    console.log('🚫 Step 5: Setting flag to skip cloud restore...');
    sessionStorage.setItem('skip_cloud_restore', 'true');
    console.log('  ✅ Flag set - fresh keys will be generated on refresh');

    console.log('');
    console.log('✅ NUCLEAR RESET COMPLETE');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Press F5 to refresh the page');
    console.log('2. App will generate fresh keys on next load');
    console.log('3. Send a test message to verify encryption works');
    console.log('');
    
    alert(
      '✅ Reset complete!\n\n' +
      'Press F5 to refresh the page.\n' +
      'Fresh encryption keys will be generated.'
    );

  } catch (error) {
    console.error('❌ Reset failed:', error);
    alert(`❌ Reset failed: ${error.message}`);
  }
})();
