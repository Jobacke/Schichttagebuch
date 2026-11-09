import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Flame, ArrowRight, Lock, Mail } from 'lucide-react';

export default function Login() {
    const { login, register, currentUser } = useAuth();
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (currentUser) {
            navigate('/');
        }
    }, [currentUser, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await register(email, password);
            }
        } catch (err) {
            console.error(err);
            setError(err.message.includes('auth/invalid-credential') ? 'Falsche Zugangsdaten.' : err.message);
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            paddingTop: 'calc(24px + env(safe-area-inset-top))',
            background: 'linear-gradient(180deg, rgb(var(--rgb-primary) / 0.10) 0%, var(--c-bg) 42%)',
            borderTop: '4px solid var(--juh-red)'
        }}>
            {/* Hero Section */}
            <div style={{ textAlign: 'center', marginBottom: '40px' }} className="animate-in">
                <img
                    src="/logo.svg?v=5"
                    alt="Schichttagebuch Logo"
                    style={{
                        width: '88px',
                        height: '88px',
                        borderRadius: '26px',
                        margin: '0 auto 22px',
                        display: 'block',
                        boxShadow: '0 14px 34px rgb(var(--rgb-primary) / 0.35)'
                    }}
                />
                <h1 style={{ fontSize: '34px', marginBottom: '8px', letterSpacing: '-0.03em' }}>Schichttagebuch</h1>
                <p style={{ color: 'var(--c-text-muted)', fontSize: '16px' }}>Deine Schichten. Einfach. Überall.</p>
            </div>

            {/* Card */}
            <div className="card-premium animate-in" style={{ width: '100%', maxWidth: '400px', padding: '28px', borderRadius: '24px', boxShadow: 'var(--shadow-float)' }}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '22px', color: 'var(--c-text)', marginBottom: '6px', textTransform: 'none', letterSpacing: '-0.01em' }}>
                        {isLogin ? 'Willkommen zurück' : 'Konto erstellen'}
                    </h2>
                    <p style={{ color: 'var(--c-text-subtle)', fontSize: '14px', margin: 0 }}>
                        {isLogin ? 'Melde dich an, um fortzufahren' : 'Starte jetzt mit deiner Planung'}
                    </p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgb(var(--rgb-danger) / 0.1)',
                        color: 'var(--c-danger)',
                        padding: '12px',
                        borderRadius: '12px',
                        marginBottom: '20px',
                        fontSize: '14px',
                        textAlign: 'center',
                        border: '1px solid rgb(var(--rgb-danger) / 0.2)'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label className="text-label" style={{ marginBottom: '8px', display: 'block' }}>Email Adresse</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={20} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--c-text-subtle)' }} />
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="input-premium"
                                style={{ paddingLeft: '44px' }}
                                placeholder="name@beispiel.de"
                                required
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label className="text-label" style={{ marginBottom: '8px', display: 'block' }}>Passwort</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={20} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--c-text-subtle)' }} />
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="input-premium"
                                style={{ paddingLeft: '44px' }}
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <button disabled={loading} className="btn-primary" style={{ height: '52px', width: '100%' }}>
                        {loading ? 'Lade...' : (isLogin ? 'Anmelden' : 'Registrieren')}
                        {!loading && <ArrowRight size={20} />}
                    </button>
                </form>

                <div style={{ marginTop: '24px', textAlign: 'center' }}>
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        style={{ background: 'none', border: 'none', color: 'var(--c-text-muted)', fontSize: '14px', cursor: 'pointer' }}
                    >
                        {isLogin ? 'Noch kein Konto? ' : 'Bereits registriert? '}
                        <span style={{ color: 'var(--c-primary-text)', fontWeight: 700 }}>
                            {isLogin ? 'Jetzt registrieren' : 'Hier anmelden'}
                        </span>
                    </button>
                </div>
            </div>

            {/* Footer Information */}
            <div style={{ marginTop: '32px', maxWidth: '300px', textAlign: 'center', opacity: 0.8 }}>
                <p style={{ fontSize: '12px', color: 'var(--c-text-muted)', lineHeight: '1.5' }}>
                    Sichere Cloud-Synchronisation.<br />Deine Daten gehören dir.
                </p>
            </div>
        </div>
    );
}
