<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        abort_unless(self::registrationOpen(), 403, 'Registration is closed.');

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::create($data);

        // New users are logged in with a long-lived remember cookie (1 year).
        Auth::setRememberDuration(60 * 24 * 365);
        Auth::login($user, true);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return new UserResource($user);
    }

    /** First account is always allowed; later ones only when enabled in config. */
    public static function registrationOpen(): bool
    {
        return config('app.allow_registration') || ! User::query()->exists();
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
            'remember' => 'boolean',
        ]);

        $remember = (bool) ($data['remember'] ?? false);

        if ($remember) {
            // "Remember me" persists the session for ~1 year.
            Auth::setRememberDuration(60 * 24 * 365);
        }

        if (! Auth::attempt(['email' => $data['email'], 'password' => $data['password']], $remember)) {
            throw ValidationException::withMessages([
                'email' => __('auth.failed'),
            ]);
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return new UserResource(Auth::user());
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }

    public function user(Request $request)
    {
        return new UserResource($request->user());
    }

    public function updatePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'confirmed', 'min:8'],
        ]);

        $request->user()->update(['password' => $data['password']]);

        return response()->noContent();
    }

    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => 'required|email']);

        $status = Password::sendResetLink($request->only('email'));

        // Don't reveal whether the email exists.
        return response()->json(['status' => __($status)]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
            'password' => 'required|confirmed|min:8',
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => $password])->save();
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['status' => __($status)]);
        }

        throw ValidationException::withMessages(['email' => [__($status)]]);
    }

    public function updateSettings(Request $request)
    {
        $data = $request->validate([
            'settings' => 'required|array',
        ]);

        $user = $request->user();
        $user->settings = array_merge($user->settings ?? [], $data['settings']);
        $user->save();

        return new UserResource($user);
    }
}
