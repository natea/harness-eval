# require opt-in to access the pickle codec

_Opened by @d-v-b_

the pickle codec is useful but also a huge security hole, since it allows arbitrary code execution based on encoded data. opening data encoded with the pickle codec should probably fail unless the user has explicitly opted in to accessing the unsafe codec, e.g. via an environment variable and runtime configuration setting.
