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
            background: 'radial-gradient(circle at top center, #1e293b 0%, #0f172a 100%)'
        }}>
            {/* Hero Section */}
            <div style={{ textAlign: 'center', marginBottom: '40px' }} className="animate-in">
                <div style={{
                    width: '80px',
                    height: '80px',
                    background: 'rgba(249, 115, 22, 0.1)',
                    borderRadius: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 24px',
                    boxShadow: '0 0 40px rgba(249, 115, 22, 0.1)'
                }}>
                    <Flame size={40} color="#f97316" strokeWidth={2.5} />
                </div>
                <h1 style={{ fontSize: '32px', marginBottom: '8px', letterSpacing: '-0.5px' }}>Schichttagebuch</h1>
                <p style={{ color: '#94a3b8', fontSize: '16px' }}>Deine Schichten. Einfach. Überall.</p>
            </div>

            {/* Card */}
            <div className="card-premium" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '20px', color: 'white', marginBottom: '4px' }}>
                        {isLogin ? 'Willkommen zurück' : 'Konto erstellen'}
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                        {isLogin ? 'Melde dich an, um fortzufahren' : 'Starte jetzt mit deiner Planung'}
                    </p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        padding: '12px',
                        borderRadius: '12px',
                        marginBottom: '20px',
                        fontSize: '14px',
                        textAlign: 'center',
                        border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label className="text-label" style={{ marginBottom: '8px', display: 'block' }}>Email Adresse</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={20} style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }} />
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
                            <Lock size={20} style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }} />
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

                    <button disabled={loading} className="btn-primary" style={{ height: '48px' }}>
                        {loading ? 'Lade...' : (isLogin ? 'Anmelden' : 'Registrieren')}
                        {!loading && <ArrowRight size={20} />}
                    </button>
                </form>

                <div style={{ marginTop: '24px', textAlign: 'center' }}>
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}
                    >
                        {isLogin ? 'Noch kein Konto? ' : 'Bereits registriert? '}
                        <span style={{ color: '#f97316', fontWeight: 600 }}>
                            {isLogin ? 'Jetzt registrieren' : 'Hier anmelden'}
                        </span>
                    </button>
                </div>
            </div>

            {/* Footer Information */}
            <div style={{ marginTop: '40px', maxWidth: '300px', textAlign: 'center', opacity: 0.5 }}>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5' }}>
                    Sichere Cloud-Synchronisation.<br />Deine Daten gehören dir.
                </p>
            </div>
        </div>
    );
}
