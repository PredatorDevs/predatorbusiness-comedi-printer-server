/*
 * profile.c -- A simple configuration file parsing "library in a file"
 *
 * The profile library was originally written by Theodore Ts'o in 1995
 * for use in the MIT Kerberos v5 library.  It has been
 * modified/enhanced/bug-fixed over time by other members of the MIT
 * Kerberos team.  This version was originally taken from the Kerberos
 * v5 distribution, version 1.4.2, and radically simplified for use in
 * e2fsprogs.  (Support for locking for multi-threaded operations,
 * being able to modify and update the configuration file
 * programmatically, and Mac/Windows portability have been removed.
 * It has been folded into a single C source file to make it easier to
 * fold into an application program.)
 *
 * Copyright (C) 2005, 2006 by Theodore Ts'o.
 *
 * %Begin-Header%
 * This file may be redistributed under the terms of the GNU Public
 * License.
 * %End-Header%
 *
 * Copyright (C) 1985-2005 by the Massachusetts Institute of Technology.
 *
 * All rights reserved.
 *
 * Export of this software from the United States of America may require
 * a specific license from the United States Government.  It is the
 * responsibility of any person or organization contemplating export to
 * obtain such a license before exporting.
 *
 * WITHIN THAT CONSTRAINT, permission to use, copy, modify, and
 * distribute this software and its documentation for any purpose and
 * without fee is hereby granted, provided that the above copyright
 * notice appear in all copies and that both that copyright notice and
 * this permission notice appear in supporting documentation, and that
 * the name of M.I.T. not be used in advertising or publicity pertaining
 * to distribution of the software without specific, written prior
 * permission.  Furthermore if you modify this software you must label
 * your software as modified software and not distribute it in such a
 * fashion that it might be confused with the original MIT software.
 * M.I.T. makes no representations about the suitability of this software
 * for any purpose.  It is provided "as is" without express or implied
 * warranty.
 *
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND WITHOUT ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, WITHOUT LIMITATION, THE IMPLIED
 * WARRANTIES OF MERCHANTIBILITY AND FITNESS FOR A PARTICULAR PURPOSE.
 *
 */

#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>
#include <errno.h>
#include <ctype.h>
#include <limits.h>

#include "profile.h"
#include "msapi_utf8.h"

#if defined(_MSC_VER)
#define strcasecmp _stricmp 
#endif

/*
 * prof_int.h
 */
typedef long prf_magic_t;

/*
 * This is the structure which stores the profile information for a
 * particular configuration file.
 */
struct _prf_file_t {
	prf_magic_t	magic;
	char		*filespec;
#ifdef STAT_ONCE_PER_SECOND
	time_t		last_stat;
#endif
	time_t		timestamp; /* time tree was last updated from file */
	int		flags;	/* r/w, dirty */
	int		upd_serial; /* incremented when data changes */
	struct profile_node *root;
	struct _prf_file_t *next;
};

typedef struct _prf_file_t *prf_file_t;

/*
 * The profile flags
 */
#define PROFILE_FILE_RW		0x0001
#define PROFILE_FILE_DIRTY	0x0002
#define PROFILE_FILE_NO_RELOAD	0x0004

/*
 * This structure defines the high-level, user visible profile_t
 * object, which is used as a handle by users who need to query some
 * configuration file(s)
 */
struct _profile_t {
	prf_magic_t	magic;
	prf_file_t	first_file;
};

/*
 * Used by the profile iterator in prof_get.c
 */
#define PROFILE_ITER_LIST_SECTION	0x0001
#define PROFILE_ITER_SECTIONS_ONLY	0x0002
#define PROFILE_ITER_RELATIONS_ONLY	0x0004

#define PROFILE_ITER_FINAL_SEEN		0x0100

/*
 * Check if a filespec is last in a list (NULL on UNIX, invalid FSSpec on MacOS
 */

#define	PROFILE_LAST_FILESPEC(x) (((x) == NULL) || ((x)[0] == '\0'))

#define CHECK_MAGIC(node) \
	  if ((node)->magic != PROF_MAGIC_NODE) \
		  return PROF_MAGIC_NODE;

/* profile parser declarations */
struct parse_state {
	int	state;
	int	group_level;
	int	line_num;
	struct profile_node *root_section;
	struct profile_node *current_section;
};

static const char *default_filename = "<default>";

static profile_syntax_err_cb_t	syntax_err_cb;

static long parse_line(char *line, struct parse_state *state);

#ifdef PROFILE_DEBUG
static long profile_write_tree_file
	(struct profile_node *root, FILE *dstfile);
#endif


static void profile_free_node
	(struct profile_node *relation);

static long profile_create_node
	(const char *name, const char *value,
		   struct profile_node **ret_node);

#ifdef PROFILE_DEBUG
static long profile_verify_node
	(struct profile_node *node);
#endif

static long profile_add_node
	(struct profile_node *section,
		    const char *name, const char *value,
		    struct profile_node **ret_node);

static long profile_find_node
	(struct profile_node *section,
		    const char *name, const char *value,
		    int section_flag, void **state,
		    struct profile_node **node);

static long profile_node_iterator
	(void	**iter_p, struct profile_node **ret_node,
		   char **ret_name, char **ret_value);

static long profile_open_file
	(const char * file, prf_file_t *ret_prof);

static long profile_update_file
	(prf_file_t prf);

static void profile_free_file
	(prf_file_t profile);

static long profile_get_value(profile_t profile, const char *name,
				   const char *subname, const char *subsubname,
				   const char **ret_value);

long
profile_open(const char* filename, profile_t *ret_profile)
{
	profile_t profile;
	long retval = 0;

	profile = malloc(sizeof(struct _profile_t));
	if (!profile)
		return ENOMEM;

	memset(profile, 0, sizeof(struct _profile_t));
	profile->magic = PROF_MAGIC_PROFILE;

	retval = profile_open_file(filename, &profile->first_file);
	if (retval) {
		profile_close(profile);
		return retval;
	}
	*ret_profile = profile;
	return 0;
}

void
profile_close(profile_t profile)
{
	prf_file_t	p, next;

	if (!profile || profile->magic != PROF_MAGIC_PROFILE)
		return;

	for (p = profile->first_file; p; p = next) {
		next = p->next;
		profile_free_file(p);
	}
	profile->magic = 0;
	free(profile);
}


/*
 * prof_file.c ---- routines that manipulate an individual profile file.
 */

long profile_open_file(const char * filespec,
			    prf_file_t *ret_prof)
{
	prf_file_t	prf;
	long	retval;
	char		*home_env = 0;
	unsigned int	len;
	char		*expanded_filename;

	prf = malloc(sizeof(struct _prf_file_t));
	if (!prf)
		return ENOMEM;
	memset(prf, 0, sizeof(struct _prf_file_t));
	prf->magic = PROF_MAGIC_FILE;

	len = (unsigned int)strlen(filespec)+1;
	if (filespec[0] == '~' && filespec[1] == '/') {
		home_env = getenvU("HOME");
		if (home_env)
			len += (unsigned int)strlen(home_env);
	}
	expanded_filename = malloc(len);
	if (expanded_filename == 0) {
	    profile_free_file(prf);
	    return errno;
	}
	if (home_env) {
	    strcpy(expanded_filename, home_env);
	    strcat(expanded_filename, filespec+1);
	} else
	    memcpy(expanded_filename, filespec, len);

	prf->filespec = expanded_filename;

	if (strcmp(prf->filespec, default_filename) != 0) {
		retval = profile_update_file(prf);
		if (retval) {
			profile_free_file(prf);
			return retval;
		}
	}

	*ret_prof = prf;
	return 0;
}

long profile_update_file(prf_file_t prf)
{
	long retval;
	FILE *f;
	char buf[2048];
	struct parse_state state;

	if (prf->flags & PROFILE_FILE_NO_RELOAD)
		return 0;

	if (prf->root) {
	    return 0;
	}

	memset(&state, 0, sizeof(struct parse_state));
	retval = profile_create_node("(root)", 0, &state.root_section);
	if (retval)
		return retval;
	errno = 0;
	f = fopenU(prf->filespec, "r");
	if (f == NULL) {
		retval = errno;
		if (retval == 0)
			retval = ENOENT;
		return retval;
	}
	prf->upd_serial++;
	while (!feof(f)) {
		if (fgets(buf, sizeof(buf), f) == NULL)
			break;
		retval = parse_line(buf, &state);
		if (retval) {
			if (syntax_err_cb)
				(syntax_err_cb)(prf->filespec, retval,
						state.line_num);
			fclose(f);
			return retval;
		}
	}
	prf->root = state.root_section;

	fclose(f);

	return 0;
}

void profile_free_file(prf_file_t prf)
{
    if (prf->root)
	profile_free_node(prf->root);
    free(prf->filespec);
    free(prf);
}

/* Begin the profile parser */

profile_syntax_err_cb_t profile_set_syntax_err_cb(profile_syntax_err_cb_t hook)
{
	profile_syntax_err_cb_t	old;

	old = syntax_err_cb;
	syntax_err_cb = hook;
	return(old);
}

#define STATE_INIT_COMMENT	0
#define STATE_STD_LINE		1
#define STATE_GET_OBRACE	2

static char *skip_over_blanks(char *cp)
{
	while (*cp && isspace((int) (*cp)))
		cp++;
	return cp;
}

static int end_or_comment(char ch)
{
	return (ch == 0 || ch == '#' || ch == ';');
}

static char *skip_over_nonblanks(char *cp)
{
	while (!end_or_comment(*cp) && !isspace(*cp))
		cp++;
	return cp;
}

static void strip_line(char *line)
{
	char *p = line + strlen(line);
	while (p > line && (p[-1] == '\n' || p[-1] == '\r'))
	    *p-- = 0;
}

static void parse_quoted_string(char *str)
{
	char *to, *from;

	for (to = from = str; *from && *from != '"'; to++, from++) {
		if (*from == '\\') {
			from++;
			switch (*from) {
			case 'n':
				*to = '\n';
				break;
			case 't':
				*to = '\t';
				break;
			case 'b':
				*to = '\b';
				break;
			default:
				*to = *from;
			}
			continue;
		}
		*to = *from;
	}
	*to = '\0';
}

static long parse_line(char *line, struct parse_state *state)
{
	char	*cp, ch, *tag, *value;
	char	*p;
	long retval;
	struct profile_node	*node;
	int do_subsection = 0;
	void *iter = 0;

	state->line_num++;
	if (state->state == STATE_GET_OBRACE) {
		cp = skip_over_blanks(line);
		if (*cp != '{')
			return PROF_MISSING_OBRACE;
		state->state = STATE_STD_LINE;
		return 0;
	}
	if (state->state == STATE_INIT_COMMENT) {
		if (line[0] != '[')
			return 0;
		state->state = STATE_STD_LINE;
	}

	if (*line == 0)
		return 0;
	strip_line(line);
	cp = skip_over_blanks(line);
	ch = *cp;
	if (end_or_comment(ch))
		return 0;
	if (ch == '[') {
		if (state->group_level > 0)
			return PROF_SECTION_NOTOP;
		cp++;
		cp = skip_over_blanks(cp);
		p = strchr(cp, ']');
		if (p == NULL)
			return PROF_SECTION_SYNTAX;
		if (*cp == '"') {
			cp++;
			parse_quoted_string(cp);
		} else {
			*p-- = '\0';
			while (isspace(*p) && (p > cp))
				*p-- = '\0';
			if (*cp == 0)
				return PROF_SECTION_SYNTAX;
		}
		retval = profile_find_node(state->root_section, cp, 0, 1,
					   &iter, &state->current_section);
		if (retval == PROF_NO_SECTION) {
			retval = profile_add_node(state->root_section,
						  cp, 0,
						  &state->current_section);
			if (retval)
				return retval;
		} else if (retval)
			return retval;

		/*
		 * Finish off the rest of the line.
		 */
		cp = p+1;
		if (*cp == '*') {
			state->current_section->final = 1;
			cp++;
		}
		/*
		 * Spaces or comments after ']' should not be fatal
		 */
		cp = skip_over_blanks(cp);
		if (!end_or_comment(*cp))
			return PROF_SECTION_SYNTAX;
		return 0;
	}
	if (ch == '}') {
		if (state->group_level == 0)
			return PROF_EXTRA_CBRACE;
		if (*(cp+1) == '*')
			state->current_section->final = 1;
		state->current_section = state->current_section->parent;
		state->group_level--;
		return 0;
	}
	/*
	 * Parse the relations
	 */
	tag = cp;
	cp = strchr(cp, '=');
	if (!cp)
		return PROF_RELATION_SYNTAX;
	if (cp == tag)
	    return PROF_RELATION_SYNTAX;
	*cp = '\0';
	if (*tag == '"') {
		tag++;
		parse_quoted_string(tag);
	} else {
		/* Look for whitespace on left-hand side.  */
		p = skip_over_nonblanks(tag);
		if (*p)
			*p++ = 0;
		p = skip_over_blanks(p);
		/* If we have more non-whitespace, it's an error.  */
		if (*p)
			return PROF_RELATION_SYNTAX;
	}

	cp = skip_over_blanks(cp+1);
	value = cp;
	ch = value[0];
	if (ch == '"') {
		value++;
		parse_quoted_string(value);
	} else if (end_or_comment(ch)) {
		do_subsection++;
		state->state = STATE_GET_OBRACE;
	} else if (value[0] == '{') {
		cp = skip_over_blanks(value+1);
		ch = *cp;
		if (end_or_comment(ch))
			do_subsection++;
		else
			return PROF_RELATION_SYNTAX;
	} else {
		cp = skip_over_nonblanks(value);
		p = skip_over_blanks(cp);
		ch = *p;
		*cp = 0;
		if (!end_or_comment(ch))
			return PROF_RELATION_SYNTAX;
	}
	if (do_subsection) {
		p = strchr(tag, '*');
		if (p)
			*p = '\0';
		retval = profile_add_node(state->current_section,
					  tag, 0, &state->current_section);
		if (retval)
			return retval;
		if (p)
			state->current_section->final = 1;
		state->group_level++;
		return 0;
	}
	p = strchr(tag, '*');
	if (p)
		*p = '\0';
	profile_add_node(state->current_section, tag, value, &node);
	if (p)
		node->final = 1;
	return 0;
}

#ifdef PROFILE_DEBUG
/*
 * Return TRUE if the string begins or ends with whitespace
 */
static int need_double_quotes(char *str)
{
	if (!str || !*str)
		return 0;
	if (isspace((int) (*str)) ||isspace((int) (*(str + strlen(str) - 1))))
		return 1;
	if (strchr(str, '\n') || strchr(str, '\t') || strchr(str, '\b') ||
	    strchr(str, ' ') || strchr(str, '#') || strchr(str, ';'))
		return 1;
	return 0;
}

/*
 * Output a string with double quotes, doing appropriate backquoting
 * of characters as necessary.
 */
static void output_quoted_string(char *str, void (*cb)(const char *,void *),
				 void *data)
{
	char	ch;
	char buf[2];

	cb("\"", data);
	if (!str) {
		cb("\"", data);
		return;
	}
	buf[1] = 0;
	while ((ch = *str++)) {
		switch (ch) {
		case '\\':
			cb("\\\\", data);
			break;
		case '\n':
			cb("\\n", data);
			break;
		case '\t':
			cb("\\t", data);
			break;
		case '\b':
			cb("\\b", data);
			break;
		default:
			/* This would be a lot faster if we scanned
			   forward for the next "interesting"
			   character.  */
			buf[0] = ch;
			cb(buf, data);
			break;
		}
	}
	cb("\"", data);
}

#ifndef EOL
#define EOL "\n"
#endif

/* Errors should be returned, not ignored!  */
static void dump_profile(struct profile_node *root, int level,
			 void (*cb)(const char *, void *), void *data)
{
	int i;
	struct profile_node *p;
	void *iter;
	long retval;

	iter = 0;
	do {
		retval = profile_find_node(root, 0, 0, 0, &iter, &p);
		if (retval)
			break;
		for (i=0; i < level; i++)
			cb("\t", data);
		if (need_double_quotes(p->name))
			output_quoted_string(p->name, cb, data);
		else
			cb(p->name, data);
		cb(" = ", data);
		if (need_double_quotes(p->value))
			output_quoted_string(p->value, cb, data);
		else
			cb(p->value, data);
		cb(EOL, data);
	} while (iter != 0);

	iter = 0;
	do {
		retval = profile_find_node(root, 0, 0, 1, &iter, &p);
		if (retval)
			break;
		if (level == 0)	{ /* [xxx] */
			cb("[", data);
			if (need_double_quotes(p->name))
				output_quoted_string(p->name, cb, data);
			else
				cb(p->name, data);
			cb("]", data);
			cb(p->final ? "*" : "", data);
			cb(EOL, data);
			dump_profile(p, level+1, cb, data);
			cb(EOL, data);
		} else { 	/* xxx = { ... } */
			for (i=0; i < level; i++)
				cb("\t", data);
			if (need_double_quotes(p->name))
				output_quoted_string(p->name, cb, data);
			else
				cb(p->name, data);
			cb(" = {", data);
			cb(EOL, data);
			dump_profile(p, level+1, cb, data);
			for (i=0; i < level; i++)
				cb("\t", data);
			cb("}", data);
			cb(p->final ? "*" : "", data);
			cb(EOL, data);
		}
	} while (iter != 0);
}

static void dump_profile_to_file_cb(const char *str, void *data)
{
	fputs(str, data);
}

long profile_write_tree_file(struct profile_node *root, FILE *dstfile)
{
	dump_profile(root, 0, dump_profile_to_file_cb, dstfile);
	return 0;
}
#endif

/*
 * prof_tree.c --- these routines maintain the parse tree of the
 * 	config file.
 *
 * All of the details of how the tree is stored is abstracted away in
 * this file; all of the other profile routines build, access, and
 * modify the tree via the accessor functions found in this file.
 *
 * Each node may represent either a relation or a section header.
 *
 * A section header must have its value field set to 0, and may a one
 * or more child nodes, pointed to by first_child.
 *
 * A relation has as its value a pointer to allocated memory
 * containing a string.  Its first_child pointer must be null.
 *
 */

/*
 * Free a node, and any children
 */
void profile_free_node(struct profile_node *node)
{
	struct profile_node *child, *next;

	if (node->magic != PROF_MAGIC_NODE)
		return;

	free(node->name);
	free(node->value);

	for (child=node->first_child; child; child = next) {
		next = child->next;
		profile_free_node(child);
	}
	node->magic = 0;

	free(node);
}

#undef strdup
#define strdup MYstrdup
static char *MYstrdup (const char *s)
{
    size_t sz = strlen(s) + 1;
    char *p = malloc(sz);
    if (p != 0)
	memcpy(p, s, sz);
    return p;
}

/*
 * Create a node
 */
long profile_create_node(const char *name, const char *value,
			      struct profile_node **ret_node)
{
	struct profile_node *new;

	new = malloc(sizeof(struct profile_node));
	if (!new)
		return ENOMEM;
	memset(new, 0, sizeof(struct profile_node));
	new->name = strdup(name);
	if (new->name == 0) {
	    free(new);
	    return ENOMEM;
	}
	if (value) {
		new->value = strdup(value);
		if (new->value == 0) {
		    profile_free_node(new);
		    return ENOMEM;
		}
	}
	new->magic = PROF_MAGIC_NODE;

	*ret_node = new;
	return 0;
}

/*
 * This function verifies that all of the representation invarients of
 * the profile are true.  If not, we have a programming bug somewhere,
 * probably in this file.
 */
#ifdef PROFILE_DEBUG
long profile_verify_node(struct profile_node *node)
{
	struct profile_node *p, *last;
	long	retval;

	CHECK_MAGIC(node);

	if (node->value && node->first_child)
		return PROF_SECTION_WITH_VALUE;

	last = 0;
	for (p = node->first_child; p; last = p, p = p->next) {
		if (p->prev != last)
			return PROF_BAD_LINK_LIST;
		if (last && (last->next != p))
			return PROF_BAD_LINK_LIST;
		if (node->group_level+1 != p->group_level)
			return PROF_BAD_GROUP_LVL;
		if (p->parent != node)
			return PROF_BAD_PARENT_PTR;
		retval = profile_verify_node(p);
		if (retval)
			return retval;
	}
	return 0;
}
#endif

/*
 * Add a node to a particular section
 */
long profile_add_node(struct profile_node *section, const char *name,
			   const char *value, struct profile_node **ret_node)
{
	long retval;
	struct profile_node *p, *last, *new;

	CHECK_MAGIC(section);

	if (section->value)
		return PROF_ADD_NOT_SECTION;

	/*
	 * Find the place to insert the new node.  We look for the
	 * place *after* the last match of the node name, since
	 * order matters.
	 */
	for (p=section->first_child, last = 0; p; last = p, p = p->next) {
		int cmp;
		cmp = strcmp(p->name, name);
		if (cmp > 0)
			break;
	}
	retval = profile_create_node(name, value, &new);
	if (retval)
		return retval;
	new->group_level = section->group_level+1;
	new->deleted = 0;
	new->parent = section;
	new->prev = last;
	new->next = p;
	if (p)
		p->prev = new;
	if (last)
		last->next = new;
	else
		section->first_child = new;
	if (ret_node)
		*ret_node = new;
	return 0;
}

/*
 * Iterate through the section, returning the nodes which match
 * the given name.  If name is NULL, then interate through all the
 * nodes in the section.  If section_flag is non-zero, only return the
 * section which matches the name; don't return relations.  If value
 * is non-NULL, then only return relations which match the requested
 * value.  (The value argument is ignored if section_flag is non-zero.)
 *
 * The first time this routine is called, the state pointer must be
 * null.  When this profile_find_node_relation() returns, if the state
 * pointer is non-NULL, then this routine should be called again.
 * (This won't happen if section_flag is non-zero, obviously.)
 *
 */
long profile_find_node(struct profile_node *section, const char *name,
			    const char *value, int section_flag, void **state,
			    struct profile_node **node)
{
	struct profile_node *p;

	CHECK_MAGIC(section);
	p = *state;
	if (p) {
		CHECK_MAGIC(p);
	} else
		p = section->first_child;

	for (; p; p = p->next) {
		if (name && (strcmp(p->name, name)))
			continue;
		if (section_flag) {
			if (p->value)
				continue;
		} else {
			if (!p->value)
				continue;
			if (value && (strcmp(p->value, value)))
				continue;
		}
		if (p->deleted)
		    continue;
		/* A match! */
		if (node)
			*node = p;
		break;
	}
	if (p == 0) {
		*state = 0;
		return section_flag ? PROF_NO_SECTION : PROF_NO_RELATION;
	}
	/*
	 * OK, we've found one match; now let's try to find another
	 * one.  This way, if we return a non-zero state pointer,
	 * there's guaranteed to be another match that's returned.
	 */
	for (p = p->next; p; p = p->next) {
		if (name && (strcmp(p->name, name)))
			continue;
		if (section_flag) {
			if (p->value)
				continue;
		} else {
			if (!p->value)
				continue;
			if (value && (strcmp(p->value, value)))
				continue;
		}
		/* A match! */
		break;
	}
	*state = p;
	return 0;
}

/*
 * This is a general-purpose iterator for returning all nodes that
 * match the specified name array.
 */
struct profile_iterator {
	prf_magic_t		magic;
	profile_t		profile;
	int			flags;
	const char 		*const *names;
	const char		*name;
	prf_file_t		file;
	int			file_serial;
	int			done_idx;
	struct profile_node 	*node;
	int			num;
};

long
profile_iterator_create(profile_t profile, const char *const *names, int flags,
			void **ret_iter)
{
	struct profile_iterator *iter;
	int	done_idx = 0;

	if (profile == 0)
		return PROF_NO_PROFILE;
	if (profile->magic != PROF_MAGIC_PROFILE)
		return PROF_MAGIC_PROFILE;
	if (!names)
		return PROF_BAD_NAMESET;
	if (!(flags & PROFILE_ITER_LIST_SECTION)) {
		if (!names[0])
			return PROF_BAD_NAMESET;
		done_idx = 1;
	}

	if ((iter = malloc(sizeof(struct profile_iterator))) == NULL)
		return ENOMEM;

	iter->magic = PROF_MAGIC_ITERATOR;
	iter->profile = profile;
	iter->names = names;
	iter->flags = flags;
	iter->file = profile->first_file;
	iter->done_idx = done_idx;
	iter->node = 0;
	iter->num = 0;
	*ret_iter = iter;
	return 0;
}

void profile_iterator_free(void **iter_p)
{
	struct profile_iterator *iter;

	if (!iter_p)
		return;
	iter = *iter_p;
	if (!iter || iter->magic != PROF_MAGIC_ITERATOR)
		return;
	free(iter);
	*iter_p = 0;
}

/*
 * Note: the returned character strings in ret_name and ret_value
 * points to the stored character string in the parse string.  Before
 * this string value is returned to a calling application
 * (profile_node_iterator is not an exported interface), it should be
 * strdup()'ed.
 */
long profile_node_iterator(void **iter_p, struct profile_node **ret_node,
				char **ret_name, char **ret_value)
{
	struct profile_iterator 	*iter = *iter_p;
	struct profile_node 		*section, *p;
	const char			*const *cpp;
	long			retval;
	int				skip_num = 0;

	if (!iter || iter->magic != PROF_MAGIC_ITERATOR)
		return PROF_MAGIC_ITERATOR;
	if (iter->file && iter->file->magic != PROF_MAGIC_FILE)
	    return PROF_MAGIC_FILE;
	/*
	 * If the file has changed, then the node pointer is invalid,
	 * so we'll have search the file again looking for it.
	 */
	if (iter->node && (iter->file &&
			   iter->file->upd_serial != iter->file_serial)) {
		iter->flags &= ~PROFILE_ITER_FINAL_SEEN;
		skip_num = iter->num;
		iter->node = 0;
	}
	if (iter->node && iter->node->magic != PROF_MAGIC_NODE) {
	    return PROF_MAGIC_NODE;
	}
get_new_file:
	if (iter->node == 0) {
		if (iter->file == 0 ||
		    (iter->flags & PROFILE_ITER_FINAL_SEEN)) {
			profile_iterator_free(iter_p);
			if (ret_node)
				*ret_node = 0;
			if (ret_name)
				*ret_name = 0;
			if (ret_value)
				*ret_value =0;
			return 0;
		}
		if ((retval = profile_update_file(iter->file))) {
		    if (retval == ENOENT || retval == EACCES) {
			/* XXX memory leak? */
			iter->file = iter->file->next;
			skip_num = 0;
			goto get_new_file;
		    } else {
			profile_iterator_free(iter_p);
			return retval;
		    }
		}
		iter->file_serial = iter->file->upd_serial;
		/*
		 * Find the section to list if we are a LIST_SECTION,
		 * or find the containing section if not.
		 */
		section = iter->file->root;
		for (cpp = iter->names; cpp[iter->done_idx]; cpp++) {
			for (p=section->first_child; p; p = p->next) {
				if (!strcmp(p->name, *cpp) && !p->value)
					break;
			}
			if (!p) {
				section = 0;
				break;
			}
			section = p;
			if (p->final)
				iter->flags |= PROFILE_ITER_FINAL_SEEN;
		}
		if (!section) {
			iter->file = iter->file->next;
			skip_num = 0;
			goto get_new_file;
		}
		iter->name = *cpp;
		iter->node = section->first_child;
	}
	/*
	 * OK, now we know iter->node is set up correctly.  Let's do
	 * the search.
	 */
	for (p = iter->node; p; p = p->next) {
		if (iter->name && strcmp(p->name, iter->name))
			continue;
		if ((iter->flags & PROFILE_ITER_SECTIONS_ONLY) &&
		    p->value)
			continue;
		if ((iter->flags & PROFILE_ITER_RELATIONS_ONLY) &&
		    !p->value)
			continue;
		if (skip_num > 0) {
			skip_num--;
			continue;
		}
		if (p->deleted)
			continue;
		break;
	}
	iter->num++;
	if (!p) {
		iter->file = (iter->file)?iter->file->next:NULL;
		iter->node = 0;
		skip_num = 0;
		goto get_new_file;
	}
	if ((iter->node = p->next) == NULL)
		iter->file = (iter->file)?iter->file->next:NULL;
	if (ret_node)
		*ret_node = p;
	if (ret_name)
		*ret_name = p->name;
	if (ret_value)
		*ret_value = p->value;
	return 0;
}


/*
 * prof_get.c --- routines that expose the public interfaces for
 * 	querying items from the profile.
 *
 */

/*
 * This function only gets the first value from the file; it is a
 * helper function for profile_get_string, profile_get_integer, etc.
 */
long profile_get_value(profile_t profile, const char *name,
			    const char *subname, const char *subsubname,
			    const char **ret_value)
{
	long		retval;
	void			*state;
	char			*value;
	const char		*names[4];

	names[0] = name;
	names[1] = subname;
	names[2] = subsubname;
	names[3] = 0;

	if ((retval = profile_iterator_create(profile, names,
					      PROFILE_ITER_RELATIONS_ONLY,
					      &state)))
		return retval;

	if ((retval = profile_node_iterator(&state, 0, 0, &value)))
		goto cleanup;

	if (value)
		*ret_value = value;
	else
		retval = PROF_NO_RELATION;

cleanup:
	profile_iterator_free(&state);
	return retval;
}

long
profile_get_string(profile_t profile, const char *name, const char *subname,
		   const char *subsubname, const char *def_val,
		   char **ret_string)
{
	const char	*value;
	long	retval;

	if (profile) {
		retval = profile_get_value(profile, name, subname,
					   subsubname, &value);
		if (retval == PROF_NO_SECTION || retval == PROF_NO_RELATION)
			value = def_val;
		else if (retval)
			return retval;
	} else
		value = def_val;

	if (value) {
		*ret_string = malloc(strlen(value)+1);
		if (*ret_string == 0)
			return ENOMEM;
		strcpy(*ret_string, value);
	} else
		*ret_string = 0;
	return 0;
}

long
profile_get_integer(profile_t profile, const char *name, const char *subname,
		    const char *subsubname, int def_val, int *ret_int)
{
	const char	*value;
	long	retval;
	char            *end_value;
	long		ret_long;

	*ret_int = def_val;
	if (profile == 0)
		return 0;

	retval = profile_get_value(profile, name, subname, subsubname, &value);
	if (retval == PROF_NO_SECTION || retval == PROF_NO_RELATION) {
		*ret_int = def_val;
		return 0;
	} else if (retval)
		return retval;

	if (value[0] == 0)
	    /* Empty string is no good.  */
	    return PROF_BAD_INTEGER;
	errno = 0;
	ret_long = strtol (value, &end_value, 10);

	/* Overflow or underflow.  */
	if ((ret_long == LONG_MIN || ret_long == LONG_MAX) && errno != 0)
	    return PROF_BAD_INTEGER;
	/* Value outside "int" range.  */
	if ((long) (int) ret_long != ret_long)
	    return PROF_BAD_INTEGER;
	/* Garbage in string.  */
	if (end_value != value + strlen (value))
	    return PROF_BAD_INTEGER;


	*ret_int = ret_long;
	return 0;
}

long
profile_get_uint(profile_t profile, const char *name, const char *subname,
		 const char *subsubname, unsigned int def_val,
		 unsigned int *ret_int)
{
	const char	*value;
	long	retval;
	char            *end_value;
	unsigned long	ret_long;

	*ret_int = def_val;
	if (profile == 0)
		return 0;

	retval = profile_get_value(profile, name, subname, subsubname, &value);
	if (retval == PROF_NO_SECTION || retval == PROF_NO_RELATION) {
		*ret_int = def_val;
		return 0;
	} else if (retval)
		return retval;

	if (value[0] == 0)
	    /* Empty string is no good.  */
	    return PROF_BAD_INTEGER;
	errno = 0;
	/* Hex support */
	if ((value[0] == '0') && (value[1] == 'x')) {
		ret_long = strtoul (value+2, &end_value, 16);
	} else {
		ret_long = strtoul (value, &end_value, 10);
	}

	/* Overflow or underflow.  */
	if ((ret_long == ULONG_MAX) && errno != 0)
	    return PROF_BAD_INTEGER;
	/* Value outside "int" range.  */
	if ((unsigned long) (unsigned int) ret_long != ret_long)
	    return PROF_BAD_INTEGER;
	/* Garbage in string.  */
	if (end_value != value + strlen (value))
	    return PROF_BAD_INTEGER;

	*ret_int = ret_long;
	return 0;
}

static const char *const conf_yes[] = {
    "y", "yes", "true", "t", "1", "on",
    0,
};

static const char *const conf_no[] = {
    "n", "no", "false", "nil", "0", "off",
    0,
};

static long
profile_parse_boolean(const char *s, int *ret_boolean)
{
    const char *const *p;

    if (ret_boolean == NULL)
    	return PROF_EINVAL;

    for(p=conf_yes; *p; p++) {
		if (!strcasecmp(*p,s)) {
			*ret_boolean = 1;
	    	return 0;
		}
    }

    for(p=conf_no; *p; p++) {
		if (!strcasecmp(*p,s)) {
			*ret_boolean = 0;
			return 0;
		}
    }

	return PROF_BAD_BOOLEAN;
}

long
profile_get_boolean(profile_t profile, const char *name, const char *subname,
		    const char *subsubname, int def_val, int *ret_boolean)
{
	const char	*value;
	long	retval;

	if (profile == 0) {
		*ret_boolean = def_val;
		return 0;
	}

	retval = profile_get_value(profile, name, subname, subsubname, &value);
	if (retval == PROF_NO_SECTION || retval == PROF_NO_RELATION) {
		*ret_boolean = def_val;
		return 0;
	} else if (retval)
		return retval;

	return profile_parse_boolean (value, ret_boolean);
}

long
profile_iterator(void **iter_p, char **ret_name, char **ret_value)
{
	char *name, *value;
	long	retval;

	retval = profile_node_iterator(iter_p, 0, &name, &value);
	if (retval)
		return retval;

	if (ret_name) {
		if (name) {
			*ret_name = malloc(strlen(name)+1);
			if (!*ret_name)
				return ENOMEM;
			strcpy(*ret_name, name);
		} else
			*ret_name = 0;
	}
	if (ret_value) {
		if (value) {
			*ret_value = malloc(strlen(value)+1);
			if (!*ret_value) {
				if (ret_name) {
					free(*ret_name);
					*ret_name = 0;
				}
				return ENOMEM;
			}
			strcpy(*ret_value, value);
		} else
			*ret_value = 0;
	}
	return 0;
}

/*
 * Human readable error string helper
 */
const char* profile_errtostr(long error_code)
{
	switch (error_code) {
	case PROF_NO_ERROR:
		return "No error";
	case PROF_VERSION:
		return "Profile version 0.0";
	case PROF_MAGIC_NODE:
		return "Bad magic value in profile_node";
	case PROF_NO_SECTION:
		return "Config section not found";
	case PROF_NO_RELATION:
		return "Config value not found";
	case PROF_ADD_NOT_SECTION:
		return "Attempt to add a value to a node which is not a section";
	case PROF_SECTION_WITH_VALUE:
		return "A config section header has a non-zero value";
	case PROF_BAD_LINK_LIST:
		return "Bad linked list in profile structures";
	case PROF_BAD_GROUP_LVL:
		return "Bad group level in profile strctures";
	case PROF_BAD_PARENT_PTR:
		return "Bad parent pointer in profile structures";
	case PROF_MAGIC_ITERATOR:
		return "Bad magic value in profile iterator";
	case PROF_SET_SECTION_VALUE:
		return "Can't set value on section node";
	case PROF_EINVAL:
		return "Invalid argument passed to profile library";
	case PROF_READ_ONLY:
		return "Attempt to modify read-only config";
	case PROF_SECTION_NOTOP:
		return "Config section header not at top level";
	case PROF_SECTION_SYNTAX:
		return "Syntax error in section header";
	case PROF_RELATION_SYNTAX:
		return "Syntax error in value assignation";
	case PROF_EXTRA_CBRACE:
		return "Extra closing brace in config";
	case PROF_MISSING_OBRACE:
		return "Missing open brace in config";
	case PROF_MAGIC_PROFILE:
		return "Bad magic value in profile_t";
	case PROF_MAGIC_SECTION:
		return "Bad magic value in profile_section_t";
	case PROF_TOPSECTION_ITER_NOSUPP:
		return "Iteration through all top level section not supported";
	case PROF_INVALID_SECTION:
		return "Invalid profile_section object";
	case PROF_END_OF_SECTIONS:
		return "No more sections";
	case PROF_BAD_NAMESET:
		return "Bad nameset passed to query routine";
	case PROF_NO_PROFILE:
		return "No config file open";
	case PROF_MAGIC_FILE:
		return "Bad magic value in profile_file_t";
	case PROF_FAIL_OPEN:
		return "Couldn't open config file";
	case PROF_EXISTS:
		return "Section already exists";
	case PROF_BAD_BOOLEAN:
		return "Invalid boolean value";
	case PROF_BAD_INTEGER:
		return "Invalid integer value";
	case PROF_MAGIC_FILE_DATA:
		return "Bad magic value in profile_file_data_t";
	}
	return "Unknown error";
}


#ifdef PROFILE_DEBUG

/*
 * test_profile.c --- testing program for the profile routine
 */

#include "profile_helpers.h"

const char *program_name = "test_profile";

#define PRINT_VALUE	1
#define PRINT_VALUES	2

void do_cmd(profile_t profile, char **argv)
{
	long	retval;
	const char	**names, *value;
	char		**values, **cpp;
	char	*cmd;
	int		print_status;

	cmd = *(argv);
	names = (const char **) argv + 1;
	print_status = 0;
	retval = 0;
	if (cmd == 0)
		return;
	if (!strcmp(cmd, "query")) {
		retval = profile_get_values(profile, names, &values);
		print_status = PRINT_VALUES;
	} else if (!strcmp(cmd, "query1")) {
		const char *name = 0;
		const char *subname = 0;
		const char *subsubname = 0;

		name = names[0];
		if (name)
			subname = names[1];
		if (subname)
			subsubname = names[2];
		if (subsubname && names[3]) {
			fprintf(stderr,
				"Only 3 levels are allowed with query1\n");
			retval = EINVAL;
		} else
			retval = profile_get_value(profile, name, subname,
						   subsubname, &value);
		print_status = PRINT_VALUE;
	} else if (!strcmp(cmd, "list_sections")) {
		retval = profile_get_subsection_names(profile, names,
						      &values);
		print_status = PRINT_VALUES;
	} else if (!strcmp(cmd, "list_relations")) {
		retval = profile_get_relation_names(profile, names,
						    &values);
		print_status = PRINT_VALUES;
	} else if (!strcmp(cmd, "dump")) {
		retval = profile_write_tree_file
			(profile->first_file->root, stdout);
#if 0
	} else if (!strcmp(cmd, "clear")) {
		retval = profile_clear_relation(profile, names);
	} else if (!strcmp(cmd, "update")) {
		retval = profile_update_relation(profile, names+2,
						 *names, *(names+1));
#endif
	} else if (!strcmp(cmd, "verify")) {
		retval = profile_verify_node
			(profile->first_file->root);
#if 0
	} else if (!strcmp(cmd, "rename_section")) {
		retval = profile_rename_section(profile, names+1, *names);
	} else if (!strcmp(cmd, "add")) {
		value = *names;
		if (strcmp(value, "NULL") == 0)
			value = NULL;
		retval = profile_add_relation(profile, names+1, value);
	} else if (!strcmp(cmd, "flush")) {
		retval = profile_flush(profile);
#endif
	} else {
		printf("Invalid command.\n");
	}
	if (retval) {
		fprintf(stderr, "error cmd='%s' error:%s\n", cmd, profile_errtostr(retval));
		print_status = 0;
	}
	switch (print_status) {
	case PRINT_VALUE:
		printf("%s\n", value);
		break;
	case PRINT_VALUES:
		for (cpp = values; *cpp; cpp++)
			printf("%s\n", *cpp);
		profile_free_list(values);
		break;
	}
}

void syntax_err_report(const char *filename, long err, int line_num)
{
	fprintf(stderr, "Syntax error in %s, line number %d: %s\n",
		filename, line_num, profile_errtostr(err));
	exit(1);
}

#if 0
const char *default_str = "[foo]\n\tbar=quux\n\tsub = {\n\t\twin = true\n}\n";

int main(int argc, char **argv)
{
    profile_t	profile;
    long	retval;
    char	*cmd;

    if (argc < 2) {
	    fprintf(stderr, "Usage: %s filename [cmd argset]\n", program_name);
	    exit(1);
    }

    initialize_prof_error_table();

    profile_set_syntax_err_cb(syntax_err_report);

    retval = profile_init_path(argv[1], &profile);
    if (retval) {
	com_err(program_name, retval, "while initializing profile");
	exit(1);
    }
    retval = profile_set_default(profile, default_str);
    if (retval) {
	com_err(program_name, retval, "while setting default");
	exit(1);
    }

    cmd = *(argv+2);
    if (!cmd || !strcmp(cmd, "batch"))
	    do_batchmode(profile);
    else
	    do_cmd(profile, argv+2);
    profile_release(profile);

    return 0;
}
#endif

#endif
