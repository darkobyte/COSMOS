const https = require('https');

class GitHubClient {
  constructor(repo) {
    this.repo = repo; // e.g., "darkobyte/COSMOS"
    this.etag = null;
  }

  /**
   * Fetch all stargazers from GitHub API
   * @returns {Promise<Array>} Array of stargazer objects
   */
  async fetchStargazers() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.repo}/stargazers`,
        headers: {
          'User-Agent': 'COSMOS-Server',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      // Add ETag for conditional requests (saves rate limit)
      if (this.etag) {
        options.headers['If-None-Match'] = this.etag;
      }

      const req = https.get(options, (res) => {
        let data = '';

        // Handle 304 Not Modified (no changes)
        if (res.statusCode === 304) {
          console.log('  [GitHub] No new stargazers (304 Not Modified)');
          resolve(null); // null = no changes
          return;
        }

        // Handle rate limit (or other 403)
        if (res.statusCode === 403) {
          const remaining = res.headers['x-ratelimit-remaining'];
          const resetTime = res.headers['x-ratelimit-reset'];

          if (resetTime && remaining === '0') {
            const resetDate = new Date(parseInt(resetTime, 10) * 1000);
            console.error(`  [GitHub] Rate limit exceeded. Resets at: ${resetDate}`);
            const err = new Error('Rate limit exceeded');
            err.code = 'RATE_LIMIT';
            err.resetAtMs = parseInt(resetTime, 10) * 1000;
            reject(err);
            return;
          }

          reject(new Error('GitHub API forbidden (403)'));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API returned ${res.statusCode}`));
          return;
        }

        // Save ETag for next request
        if (res.headers.etag) {
          this.etag = res.headers.etag;
        }

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const stargazers = JSON.parse(data);
            console.log(`  [GitHub] Fetched ${stargazers.length} stargazers`);
            resolve(stargazers);
          } catch (err) {
            reject(new Error('Failed to parse GitHub response'));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Fetch detailed user info
   * @param {string} username 
   * @returns {Promise<Object>}
   */
  async fetchUserDetails(username) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/users/${username}`,
        headers: {
          'User-Agent': 'COSMOS-Server',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.get(options, (res) => {
        let data = '';

        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API returned ${res.statusCode}`));
          return;
        }

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const user = JSON.parse(data);
            resolve(user);
          } catch (err) {
            reject(new Error('Failed to parse user data'));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }
}

module.exports = GitHubClient;
