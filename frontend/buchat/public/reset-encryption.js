/**
 * COMPLETE ENCRYPTION RESET SCRIPT
 * 
 * ⚠️ NUCLEAR OPTION - Deletes EVERYTHING encryption-related
 * 
 * Run this in browser console (F12) to completely reset encryption state.
 * This deletes:
 * - Local localStorage (signal_store, etc.)
 * - Cloud backup (from DynamoDB)
 * - Server bundle (public keys)
 * 
 * ⚠️ BOTH users must run this script!
 * After running, you'll need to login again to generate fresh keys.
 */

(async function resetEncryption() {
  console.log('🔴 STARTING COMPLETE ENCRYPTION RESET...');
  console.log('⚠️  This will delete ALL encryption keys (local + cloud + server)');
  
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('userName');
  
  if (!userId || !token) {
    console.error('❌ Not logged in! Please login first, then run this script.');
    return;
  }
  
  console.log('📋 User:', userName, '(ID:', userId + ')');
  
  // Confirm action
  const confirm = window.confirm(
    `⚠️ DANGER: This will permanently delete all encryption keys!\n\n` +
    `User: ${userName}\n\n` +
    `Are you sure you want to continue?\n\n` +
    `Click OK to RESET ENCRYPTION (this cannot be undone)\n` +
    `Click Cancel to abort`
  );
  
  if (!confirm) {
    console.log('❌ Reset cancelled by user');
    return;
  }
  
  console.log('\n🔥 Step 1/3: Deleting cloud backup and server bundle...');
  
  try {
    const response = await fetch(`/api/keybackup/reset/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      console.log('✅ Cloud backup and server bundle deleted');
    } else if (response.status === 404) {
      console.log('ℹ️ No cloud backup found (already clean)');
    } else {
      console.warn('⚠️ Cloud deletion failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ Error deleting cloud backup:', error.message);
    console.log('ℹ️ Continuing with local cleanup...');
  }
  
  console.log('\n🔥 Step 2/3: Clearing local encryption state...');
  
  // Clear encryption-related localStorage
  const keysToRemove = [
    'signal_store',
    'signal_signed_prekey_cache',
    'keyBackupPassword',
    `self_enc_key_${userId}`
  ];
  
  let localCleared = 0;
  keysToRemove.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      localCleared++;
      console.log('  ✅ Removed:', key);
    }
  });
  
  // Clear bundle version cache
  const allKeys = Object.keys(localStorage);
  allKeys.forEach(key => {
    if (key.startsWith('bundle_version_')) {
      localStorage.removeItem(key);
      localCleared++;
      console.log('  ✅ Removed bundle cache:', key);
    }
  });
  
  console.log(`✅ Cleared ${localCleared} local items`);
  
  console.log('\n🔥 Step 3/3: Cleanup complete!');
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ ENCRYPTION RESET COMPLETE');
  console.log('='.repeat(60));
  console.log('\n📝 Next steps:');
  console.log('1. Press F5 to refresh the page');
  console.log('2. You\'ll stay logged in');
  console.log('3. App will generate 100 FRESH preKeys');
  console.log('4. Fresh bundle will upload to server');
  console.log('5. Send a test message - should work! ✅');
  console.log('\n⚠️ IMPORTANT: The OTHER user must also run this script!');
  console.log('\n💡 Expected console output after refresh:');
  console.log('   "ℹ️ No cloud backup found"');
  console.log('   "🏭 Generated 100 preKeys"');
  console.log('   "🗑️ Deleting stale server bundle before upload"');
  console.log('   "forceReplace: true"');
  console.log('\n🚀 Ready to refresh! Press F5');
})();
