/**
 * Signal Protocol Migration Script - ENHANCED
 * 
 * Run this in the browser console to clear corrupted encryption state
 * and prepare for the new fixes.
 * 
 * ⚠️ IMPORTANT: Both User A and User B must run this script!
 * 
 * What this does:
 * 1. Clears corrupted Signal Protocol state (client-side)
 * 2. Deletes stale server bundle via API
 * 3. Preserves authentication (stays logged in)
 * 4. Forces fresh key generation on next page load
 */

(async function migrateSignalProtocol() {
  console.log('🔧 Starting Signal Protocol Migration...');
  
  // Get current user info to preserve session
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('userName');
  
  console.log('📋 Current user:', userName || 'Not logged in');
  
  if (!userId || !token) {
    console.warn('⚠️ Not logged in - clearing local state only');
  }
  
  // Clear only Signal Protocol related data
  const keysToRemove = [
    'signal_store',
    'signal_signed_prekey_cache',
    'keyBackupPassword'
  ];
  
  let clearedCount = 0;
  keysToRemove.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      clearedCount++;
      console.log('✅ Removed:', key);
    }
  });
  
  // Delete all bundle_version_* keys (cached bundle versions)
  const allKeys = Object.keys(localStorage);
  allKeys.forEach(key => {
    if (key.startsWith('bundle_version_')) {
      localStorage.removeItem(key);
      clearedCount++;
      console.log('✅ Removed cached bundle version:', key);
    }
  });
  
  // CRITICAL: Delete server-side bundle if user is logged in
  if (userId && token) {
    try {
      console.log('🗑️ Deleting stale server bundle...');
      const response = await fetch(`/api/keybackup/bundle/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log('✅ Server bundle deleted successfully');
      } else if (response.status === 404) {
        console.log('ℹ️ No server bundle to delete (already clean)');
      } else {
        console.warn('⚠️ Server bundle deletion failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error deleting server bundle:', error.message);
      console.log('ℹ️ Server bundle may still exist - will be replaced on next login');
    }
  }
  
  if (clearedCount === 0) {
    console.log('ℹ️ No corrupted state found - you might be already migrated!');
  } else {
    console.log(`\n✅ Migration complete! Cleared ${clearedCount} items.`);
    console.log('\n📝 Next steps:');
    console.log('1. Refresh the page (F5)');
    console.log('2. App will generate 100 fresh preKeys');
    console.log('3. Fresh bundle will be uploaded to server');
    console.log('4. Send a test message to verify encryption works');
    console.log('\n💡 Expected console output after refresh:');
    console.log('   "🔒 Initializing Signal Protocol (ONE TIME ONLY)"');
    console.log('   "🏭 Generated 100 preKeys, using first: [ID]"');
    console.log('   "📝 preKeys setter: 0 → 100 keys"');
    console.log('   "🗑️ Deleting stale server bundle before upload"');
  }
  
  // Verify user session is still intact
  if (userId && token) {
    console.log('\n✅ User session preserved - still logged in as:', userName);
  } else {
    console.log('\n⚠️ No active session - please login after refresh');
  }
  
  console.log('\n🚀 Ready to refresh! Press F5 or reload the page.');
})();
