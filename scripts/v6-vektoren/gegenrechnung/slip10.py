import hmac, hashlib, struct
def slip10_ed25519(seed, path=(44, 9077, 0, 0, 0)):
    """SLIP-0010 Ed25519, alle Ebenen gehaertet (PROTOCOL.md 'Key derivation')."""
    I = hmac.new(b'ed25519 seed', seed, hashlib.sha512).digest()
    k, c = I[:32], I[32:]
    for idx in path:
        I = hmac.new(c, b'\x00' + k + struct.pack('>I', idx + 2**31), hashlib.sha512).digest()
        k, c = I[:32], I[32:]
    return k
