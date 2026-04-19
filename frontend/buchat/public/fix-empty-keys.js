// FIX: Empty keys after refresh
// This happens when skip_cloud_restore flag blocks restoration

console.log('🔧 Checking encryption state...');

// Check current state
const signalStore = localStorage.getItem('signal_store');
const skipFlag = sessionStorage.getItem('skip_cloud_restore');

if (signalStore) {
  try {
    const data = JSON.parse(signalStore);
    const preKeyCount = Object.keys(data.preKeys || {}).length;
    console.log('📊 Current preKeys in localStorage:', preKeyCount);
    
    if (preKeyCount === 0) {
      console.log('⚠️ Found empty key state!');
      
      // Remove the skip flag so cloud restore can work
      if (skipFlag) {
        sessionStorage.removeItem('skip_cloud_restore');
        console.log('✅ Removed skip_cloud_restore flag');
      }
      
      // Clear localStorage signal data to force fresh initialization
      localStorage.removeItem('signal_store');
      localStorage.removeItem('signal_signed_prekey_cache');
      console.log('✅ Cleared empty local storage');
      
      alert(
        '✅ Fixed empty keys!\n\n' +
        'Press F5 to refresh.\n' +
        'Your keys will be restored from cloud backup.'
      );
    } else {
      console.log('✅ Keys look good (' + preKeyCount + ' preKeys)');
    }
  } catch (e) {
    console.error('Failed to parse signal_store:', e);
  }
} else {
  console.log('ℹ️ No signal_store found - will generate on login');
}

if (skipFlag) {
  console.log('⚠️ skip_cloud_restore flag is still set!');
  console.log('This will prevent key restoration on login.');
  
  const clearFlag = confirm('Remove skip_cloud_restore flag?');
  if (clearFlag) {
    sessionStorage.removeItem('skip_cloud_restore');
    console.log('✅ Flag removed');
    alert('Flag removed! Refresh to restore keys from cloud.');
  }
}
