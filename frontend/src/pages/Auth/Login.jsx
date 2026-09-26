import React, { useState } from 'react';
import AuthLayout from '../../components/layouts/AuthLayout';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Input from '../../components/Inputs/Input';
import { validateEmail } from '../../utils/helper';
import axiosInstance from '../../utils/axiosInstance';
import { API_PATHS } from '../../utils/apiPaths';
import { useDispatch } from 'react-redux';
import { setCredentials, fetchMyOrganizations } from '../../store/authSlice';
import {
  LuBriefcase,
  LuCheck,
  LuCode,
  LuCopy,
  LuCrown,
  LuLoaderCircle,
  LuLogIn,
  LuSparkles,
  LuX,
} from 'react-icons/lu';

const DEMO_PASSWORD = 'Password123!';

const DEMO_ACCOUNTS = [
  {
    roleId: 'owner',
    name: 'Alex Morgan',
    roleTitle: 'Workspace Owner',
    email: 'owner@taskforge.dev',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    description: 'Full admin authority, billing, team management & approval override',
    icon: LuCrown,
  },
  {
    roleId: 'pm',
    name: 'Taylor Swift',
    roleTitle: 'Project Manager',
    email: 'pm@taskforge.dev',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Milestone planning, team allocation & task completion approval',
    icon: LuBriefcase,
  },
  {
    roleId: 'dev',
    name: 'Jordan Lee',
    roleTitle: 'Developer / Member',
    email: 'dev@taskforge.dev',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Task execution, subtask checklists & review submission',
    icon: LuCode,
  },
];

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [loadingDemoEmail, setLoadingDemoEmail] = useState(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const location = useLocation();

  const performLogin = async (targetEmail, targetPassword) => {
    setError('');
    try {
      const response = await axiosInstance.post(API_PATHS.AUTH.LOGIN, {
        email: targetEmail,
        password: targetPassword,
      });

      const { accessToken, user } = response.data;
      if (accessToken && user) {
        dispatch(setCredentials(response.data));
        await dispatch(fetchMyOrganizations());

        const query = new URLSearchParams(location.search);
        const from = query.get('from');

        if (from) {
          navigate(decodeURIComponent(from), { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.message) {
        setError(err.response.data.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter the password');
      return;
    }

    setIsSubmitting(true);
    try {
      await performLogin(email, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async (demoAccount) => {
    setEmail(demoAccount.email);
    setPassword(DEMO_PASSWORD);
    setLoadingDemoEmail(demoAccount.email);
    try {
      await performLogin(demoAccount.email, DEMO_PASSWORD);
      setShowDemoModal(false);
    } finally {
      setLoadingDemoEmail(null);
    }
  };

  const handleCopyPassword = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(DEMO_PASSWORD);
    }
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  return (
    <AuthLayout>
      <div className="lg:w-[70%] h-3/4 md:h-full flex flex-col justify-center">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-black">Welcome Back</h3>
            <p className="text-xs text-slate-700 mt-[5px]">
              Please enter your details to log in
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDemoModal(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 px-2.5 py-1.5 rounded-lg border border-blue-200/60 transition-colors cursor-pointer"
            title="Open Demo Accounts Modal"
          >
            <LuSparkles className="w-3.5 h-3.5" />
            <span>Demo Accounts</span>
          </button>
        </div>

        <form onSubmit={handleLogin}>
          <Input
            value={email}
            onChange={({ target }) => setEmail(target.value)}
            label="Email Address"
            placeholder="john@example.com"
            type="text"
            disabled={isSubmitting}
          />

          <Input
            value={password}
            onChange={({ target }) => setPassword(target.value)}
            label="Password"
            placeholder=""
            type="password"
            disabled={isSubmitting}
          />

          <div className="text-right mt-1 mb-3">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-primary underline"
            >
              Forgot Password?
            </Link>
          </div>

          {error && <p className="text-red-500 text-xs pb-2.5">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <LuLoaderCircle className="w-4 h-4 animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              <span>Login</span>
            )}
          </button>

          <div className="flex items-center justify-between text-[13px] text-slate-800 mt-4">
            <p>
              Don't have an account?{' '}
              <Link className="font-medium text-primary underline" to="/signup">
                SignUp
              </Link>
            </p>

            <button
              type="button"
              onClick={() => setShowDemoModal(true)}
              className="text-xs font-medium text-slate-500 hover:text-primary underline cursor-pointer"
            >
              Try Demo Mode
            </button>
          </div>
        </form>
      </div>

      {/* Clean Demo Accounts Modal */}
      {showDemoModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={() => !loadingDemoEmail && setShowDemoModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg p-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-base font-semibold text-slate-900">
                  Demo Accounts
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a pre-configured role to explore TaskForge instantly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !loadingDemoEmail && setShowDemoModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                <LuX className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 my-4">
              {DEMO_ACCOUNTS.map((acc) => {
                const Icon = acc.icon;
                const isLoggingInThis = loadingDemoEmail === acc.email;

                return (
                  <div
                    key={acc.roleId}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 transition-all"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700 shrink-0 mt-0.5">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-900">
                            {acc.name}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.2 rounded border ${acc.badgeClass}`}
                          >
                            {acc.roleTitle}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {acc.description}
                        </p>
                        <span className="text-[11px] font-mono text-slate-400">
                          {acc.email}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={loadingDemoEmail !== null}
                      onClick={() => handleDemoLogin(acc)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-primary hover:bg-blue-600 px-3 py-1.5 rounded-md shrink-0 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      {isLoggingInThis ? (
                        <>
                          <LuLoaderCircle className="w-3.5 h-3.5 animate-spin" />
                          <span>Signing in...</span>
                        </>
                      ) : (
                        <>
                          <LuLogIn className="w-3.5 h-3.5" />
                          <span>1-Click</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Password for all accounts:</span>
              <button
                type="button"
                onClick={handleCopyPassword}
                className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded transition-colors cursor-pointer"
              >
                {copiedPassword ? (
                  <>
                    <LuCheck className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700 font-sans">Copied!</span>
                  </>
                ) : (
                  <>
                    <LuCopy className="w-3 h-3 text-slate-500" />
                    <span>Password123!</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
};

export default Login;
