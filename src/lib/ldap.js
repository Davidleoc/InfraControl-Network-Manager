import ldap from 'ldapjs';

export async function authenticateLDAP(username, password) {
    const client = ldap.createClient({
        url: process.env.LDAP_URL,
    });

    return new Promise((resolve, reject) => {
        // Step 1: Bind with service account
        client.bind(process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD, (err) => {
            if (err) {
                console.error('LDAP Bind Error (Service Account):', err);
                client.destroy();
                return resolve(false);
            }

            // Step 2: Search for the user to get their full DN
            const searchOptions = {
                filter: `(&(objectClass=person)(sAMAccountName=${username}))`,
                scope: 'sub',
                attributes: ['dn', 'cn', 'sAMAccountName']
            };

            client.search(process.env.LDAP_USER_BASE, searchOptions, (err, res) => {
                if (err) {
                    client.destroy();
                    return resolve(false);
                }

                let userDN = null;
                let userData = null;

                res.on('searchEntry', (entry) => {
                    userDN = entry.dn.toString();
                    userData = {
                        dn: userDN,
                        name: entry.attributes.find(a => a.type === 'cn')?.values[0] || username,
                        username: username
                    };
                });

                res.on('error', (err) => {
                    console.error('LDAP Search Error:', err);
                    client.destroy();
                    resolve(false);
                });

                res.on('end', () => {
                    if (!userDN) {
                        client.destroy();
                        return resolve(false);
                    }

                    // Step 3: Bind with user's DN and password
                    client.bind(userDN, password, (err) => {
                        client.destroy();
                        if (err) {
                            return resolve(false);
                        }
                        resolve(userData);
                    });
                });
            });
        });
    });
}
