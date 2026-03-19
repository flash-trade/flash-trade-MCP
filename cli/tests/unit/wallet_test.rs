use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use std::fs;
use tempfile::TempDir;

#[test]
fn test_keypair_generate_save_load_roundtrip() {
    let tmp = TempDir::new().unwrap();
    let keys_dir = tmp.path().join("keys");
    fs::create_dir_all(&keys_dir).unwrap();

    let keypair = Keypair::new();
    let pubkey = keypair.pubkey();

    let path = keys_dir.join("test.json");
    let bytes = keypair.to_bytes();
    let data = serde_json::to_string(&bytes.to_vec()).unwrap();
    fs::write(&path, &data).unwrap();

    let loaded_data = fs::read_to_string(&path).unwrap();
    let loaded_bytes: Vec<u8> = serde_json::from_str(&loaded_data).unwrap();
    let loaded_keypair = Keypair::from_bytes(&loaded_bytes).unwrap();

    assert_eq!(loaded_keypair.pubkey(), pubkey);
}

#[test]
fn test_keypair_file_format_is_solana_compatible() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("key.json");

    let keypair = Keypair::new();
    let bytes = keypair.to_bytes();
    let data = serde_json::to_string(&bytes.to_vec()).unwrap();
    fs::write(&path, &data).unwrap();

    let raw: Vec<u8> = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(raw.len(), 64, "Keypair should be 64 bytes");
    assert_eq!(
        &raw[32..],
        keypair.pubkey().as_ref(),
        "Last 32 bytes should be pubkey"
    );
}

#[cfg(unix)]
#[test]
fn test_keypair_file_permissions() {
    use std::os::unix::fs::PermissionsExt;

    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("key.json");

    let keypair = Keypair::new();
    let data = serde_json::to_string(&keypair.to_bytes().to_vec()).unwrap();
    fs::write(&path, &data).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();

    let perms = fs::metadata(&path).unwrap().permissions();
    assert_eq!(
        perms.mode() & 0o777,
        0o600,
        "Key file should be owner-only rw"
    );
}
