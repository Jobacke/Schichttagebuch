import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Flame } from 'lucide-react';

export default function Login() {
    const { login, register, currentUser } = useAuth();
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Redirect if already logged in
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
            // Navigation happens automatically via the useEffect above when currentUser changes
        } catch (err) {
            console.error(err);
            setError(err.message.includes('auth/invalid-credential') ? 'Falsche Zugangsdaten.' : err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 animate-in fade-in">
            <div className="mb-8 flex flex-col items-center">
                <div className="w-20 h-20 bg-primary/20 rounded-2xl flex items-center justify-center mb-4 text-primary">
                    <Flame size={40} />
                </div>
                <h1 className="text-3xl font-bold mb-1">Schichttagebuch</h1>
                <p className="text-secondary">Deine Schichten. Überall.</p>
            </div>

            <div className="card w-full max-w-sm">
                <h2 className="mb-6 text-center">{isLogin ? 'Anmelden' : 'Registrieren'}</h2>

                {error && <div className="bg-danger/20 text-danger p-3 rounded-lg mb-4 text-sm font-bold text-center">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="input-wrapper mb-2">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="input-field"
                            required
                        />
                    </div>
                    <div className="input-wrapper mb-4">
                        <label>Passwort</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="input-field"
                            required
                            minLength={6}
                        />
                    </div>
                    <button disabled={loading} className="btn btn-primary w-full">
                        {loading ? 'Lade...' : (isLogin ? 'Einloggen' : 'Konto erstellen')}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-secondary text-sm hover:text-white transition-colors"
                    >
                        {isLogin ? 'Noch kein Konto? Hier registrieren.' : 'Bereits ein Konto? Hier anmelden.'}
                    </button>
                </div>
            </div>

            <div className="mt-8 text-xs text-secondary/40 text-center max-w-xs">
                Hinweis: Du benötigst eine Internetverbindung für die Anmeldung. Deine Daten werden sicher in der Cloud gespeichert.
            </div>
        </div>
    );
}
