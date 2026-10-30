<?php
// Storefront: drops, makers, pieces, cart, checkout. Locale prefix: /tr and /en.
Route::get('/{locale}/drops', fn () => view('drops'));
Route::get('/{locale}/makers/{maker}', fn () => view('maker'));
Route::get('/{locale}/pieces/{piece}', fn () => view('piece'));
