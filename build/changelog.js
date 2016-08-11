/* eslint-disable import/no-commonjs, import/no-nodejs-modules */

const github = require('octonode').client();

const execSync = require('child_process').execSync;
const appendFileSync = require('fs').appendFileSync;
const repository = require('../package.json').repository;

const changelogFile = 'changelog/UNRELEASED.md';
const commit = 'HEAD~1';

main();

async function main() {
	if (!process.env.TRAVIS) {
		console.info('Aborting, wrong environment');
		return;
	}
	if (process.env.TRAVIS_PULL_REQUEST) {
		console.info('Aborting, wrong branch');
		return;
	}
	if (touchedChangelog()) {
		console.info('Aborting, touched changelog recently');
		return;
	}
	console.log('Getting last merged PR');
	const pr = await lastMergedPR();
	const lineItem = changelogLineItem(pr);

	console.log('Adding new line item to changelog:', lineItem);
	appendFileSync(changelogFile, lineItem);
	pushChange();
}

function touchedChangelog() {
	let diff = '';
	try {
		diff = execSync(`git diff-tree --no-commit-id --name-only -r ${commit} | grep "^changelog/"`);
	} catch (e) {
		return false;
	}
	const filenames = diff.toString().trim().split('\n');
	console.info(filenames);
	return diff.length > 0;
}

function changelogLineItem({pr, title, authors}) {
	console.log(pr, title, authors);
	const thanks = authors.map(a => `@${a}`).join(', ');
	console.log(thanks);
	return `\n* ${title} (thanks ${thanks} for #${pr})`;
}

async function lastMergedPR() {
	const commitComment = lastCommitComment();
	const { pr, title } = destructureMergeCommit(commitComment);
	const authors = await getPRAuthors(pr);

	return { pr, title, authors };
}

function lastCommitComment() {
	return execSync(`git log -1 --pretty=%B ${commit}`);
}

function destructureMergeCommit(comment) {
	const mergeMessage = /^(.*) \(#(\d+)\)\s*/;
	const [ match, title, pr ] = mergeMessage.exec(comment);
	return { pr, title };
}

async function getPRAuthors(pr) {
	const commits = await new Promise((resolve, reject) => {
		github.pr(`${repository.username}/${repository.repository}`, pr).commits((err, response, request) => {
			(err ? reject(err, response) : resolve(response));
		})
	});
	console.log(commits);
	let authors = [];
	try {
		 authors = commits
			.map(commit => [commit.author.login, commit.committer.login])
			.reduce((l, r) => l.concat(r), [])
			.filter(username => username !== 'web-flow');
	} catch (e) {
		console.error(e);
		return [];
	}
	return Array.from(new Set(authors));
}
