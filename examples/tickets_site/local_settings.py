#DEBUG = True

DATABASES = {
    'default': {
         'ENGINE': 'django.db.backends.sqlite3',
         'NAME':   None
     }
}

import os.path

STATIC_BASE = os.path.join(os.path.dirname(__file__), '..', 'data', 'static')