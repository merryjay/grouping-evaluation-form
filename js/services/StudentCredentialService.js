class StudentCredentialService {
    static SCHEMA_VERSION = 1;
    static ALGORITHM = 'PBKDF2-HMAC-SHA-256';
    static ITERATIONS = 600000;
    static SALT_BYTES = 16;
    static VERIFIER_BYTES = 32;
    static MAX_PASSWORD_LENGTH = 1024;

    static normalizeUsername(value) {
        if (typeof value !== 'string') return null;
        if (/[\p{C}]/u.test(value)) return null;
        let display;
        try { display = value.normalize('NFKC').trim().replace(/\s+/gu, ' '); } catch (e) { return null; }
        if (!EvaluationKey.isIdentity(display)) return null;
        return { display, key: display.toLocaleLowerCase('en-US') };
    }

    static accountDocumentId(normalizedUsername) {
        if (typeof normalizedUsername !== 'string' || !normalizedUsername) return null;
        const bytes = this._utf8(normalizedUsername);
        return bytes ? this._base64url(bytes) : null;
    }

    static isAvailable(cryptoProvider = this._crypto()) {
        return !!(cryptoProvider && cryptoProvider.subtle && typeof cryptoProvider.getRandomValues === 'function'
            && typeof TextEncoder !== 'undefined');
    }

    static async createRecord(displayName, password, cryptoProvider = this._crypto()) {
        const identity = this.normalizeUsername(displayName);
        if (!identity || !this._validPassword(password) || !this.isAvailable(cryptoProvider)) return null;
        const salt = new Uint8Array(this.SALT_BYTES);
        cryptoProvider.getRandomValues(salt);
        const verifier = await this._derive(password, salt, cryptoProvider);
        if (!verifier || verifier.length !== this.VERIFIER_BYTES) return null;
        return {
            schemaVersion: this.SCHEMA_VERSION,
            normalizedUsername: identity.key,
            displayName: identity.display,
            algorithm: this.ALGORITHM,
            iterations: this.ITERATIONS,
            salt: this._base64url(salt),
            verifier: this._base64url(verifier)
        };
    }

    static validateRecord(record) {
        if (!record || typeof record !== 'object' || Array.isArray(record)
            || record.schemaVersion !== this.SCHEMA_VERSION
            || record.algorithm !== this.ALGORITHM
            || record.iterations !== this.ITERATIONS) return null;
        const identity = this.normalizeUsername(record.displayName);
        if (!identity || identity.key !== record.normalizedUsername) return null;
        const salt = this._fromBase64url(record.salt);
        const verifier = this._fromBase64url(record.verifier);
        if (!salt || !verifier || salt.length !== this.SALT_BYTES || verifier.length !== this.VERIFIER_BYTES) return null;
        return { ...record, normalizedUsername: identity.key, displayName: identity.display, salt, verifier };
    }

    static async verify(record, password, cryptoProvider = this._crypto()) {
        const valid = record && record.salt instanceof Uint8Array && record.verifier instanceof Uint8Array
            ? this._validatedDecodedRecord(record)
            : this.validateRecord(record);
        if (!valid || !this._validPassword(password) || !this.isAvailable(cryptoProvider)) return false;
        const derived = await this._derive(password, valid.salt, cryptoProvider);
        return !!derived && this._constantTimeEqual(derived, valid.verifier);
    }

    static _validPassword(password) {
        return typeof password === 'string' && password.length > 0 && password.length <= this.MAX_PASSWORD_LENGTH;
    }

    static _validatedDecodedRecord(record) {
        const identity = this.normalizeUsername(record.displayName);
        if (!identity || record.schemaVersion !== this.SCHEMA_VERSION
            || record.algorithm !== this.ALGORITHM || record.iterations !== this.ITERATIONS
            || record.normalizedUsername !== identity.key
            || record.salt.length !== this.SALT_BYTES || record.verifier.length !== this.VERIFIER_BYTES) return null;
        return record;
    }

    static async _derive(password, salt, cryptoProvider) {
        try {
            const source = this._utf8(password);
            if (!source) return null;
            const material = await cryptoProvider.subtle.importKey('raw', source, 'PBKDF2', false, ['deriveBits']);
            const bits = await cryptoProvider.subtle.deriveBits({
                name: 'PBKDF2',
                hash: 'SHA-256',
                salt,
                iterations: this.ITERATIONS
            }, material, this.VERIFIER_BYTES * 8);
            return new Uint8Array(bits);
        } catch (e) {
            return null;
        }
    }

    static _constantTimeEqual(left, right) {
        if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false;
        let difference = 0;
        for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
        return difference === 0;
    }

    static _utf8(value) {
        try { return new TextEncoder().encode(value); } catch (e) { return null; }
    }

    static _base64url(bytes) {
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const encoded = typeof btoa === 'function'
            ? btoa(binary)
            : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : null);
        return encoded ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : null;
    }

    static _fromBase64url(value) {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
        try {
            const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
            const binary = typeof atob === 'function'
                ? atob(base64)
                : (typeof Buffer !== 'undefined' ? Buffer.from(base64, 'base64').toString('binary') : null);
            if (binary === null) return null;
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
            return bytes;
        } catch (e) {
            return null;
        }
    }

    static _crypto() {
        if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
        if (typeof window !== 'undefined' && window.crypto) return window.crypto;
        return null;
    }
}
